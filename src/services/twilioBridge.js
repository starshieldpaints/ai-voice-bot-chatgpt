import { WebSocketServer, WebSocket } from "ws";
import { env } from "../config.js";
import { createRealtimeSession } from "./openai.js";
import { searchDocs } from "./azureSearch.js";
import { createLead } from "./leads.js";
import { consumePrefetchedSession } from "./realtimeSessionCache.js";
import { firebaseLoggingEnabled, recordConversationEvent } from "./firebase.js";
import { generateAndStoreSummary } from "./summary.js";
import { log, warn, err } from "../utils/logger.js";

const OUTPUT_AUDIO_FORMAT = "g711_ulaw";
const INPUT_AUDIO_FORMAT = "g711_ulaw";

export function attachTwilioBridge(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket, request) => {
    const { pathname } = safeParseUrl(request.url, request.headers.host);
    if (pathname !== "/twilio/stream") {
      socket.close(1008, "Unsupported path");
      return;
    }

    if (!env.TWILIO_ENABLED) {
      socket.close(1011, "Twilio disabled on server");
      return;
    }

    log("Twilio media stream connected");
    const session = createSession(socket);

    socket.on("message", data => handleTwilioMessage(session, data));
    socket.on("error", error => {
      warn("Twilio WebSocket error", error);
      socket.close();
    });
    socket.on("close", () => {
      log("Twilio media stream closed");
      teardownSession(session);
    });
  });
}

function createSession(twilioSocket) {
  return {
    twilioSocket,
    modelSocket: undefined,
    streamSid: undefined,
    callSid: undefined,
    conversationId: undefined,
    connecting: false,
    lastAssistantItem: undefined,
    responseStartTimestamp: undefined,
    latestMediaTimestamp: undefined,
    loggedEvents: new Set(),
    leadId: undefined,
    transcriptParts: []
  };
}

function teardownSession(session) {
  closeSocket(session.modelSocket);
  session.modelSocket = undefined;
  session.streamSid = undefined;
  session.callSid = undefined;
  session.conversationId = undefined;
  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
  session.latestMediaTimestamp = undefined;
  session.leadId = undefined;
  session.transcriptParts = [];
  if (session.loggedEvents) {
    session.loggedEvents.clear();
  }
}

function handleTwilioMessage(session, raw) {
  const message = parseJson(raw);
  if (!message) return;

  switch (message.event) {
    case "start":
      session.streamSid = message.start?.streamSid;
      session.callSid = message.start?.callSid || session.callSid;
      session.conversationId = session.callSid || session.streamSid || session.conversationId;
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;
      logConversationEventForSession(session, {
        role: "system",
        text: "Call started",
        kind: "call_status",
        metadata: { status: "started" }
      });
      connectModel(session);
      break;
    case "media":
      session.latestMediaTimestamp = message.media?.timestamp ?? session.latestMediaTimestamp;
      if (isSocketOpen(session.modelSocket)) {
        jsonSend(session.modelSocket, {
          type: "input_audio_buffer.append",
          audio: message.media?.payload
        });
      }
      break;
    case "stop":
    case "close":
      logConversationEventForSession(session, {
        role: "system",
        text: "Call ended",
        kind: "call_status",
        metadata: { status: "ended" }
      });
      if (session.transcriptParts && session.transcriptParts.length > 0) {
        generateAndStoreSummary({
          conversationId: session.conversationId,
          leadId: session.leadId || null,
          transcriptParts: [...session.transcriptParts],
          channel: "phone"
        }).catch(e => warn("Post-call summary failed", e));
      }
      teardownSession(session);
      closeSocket(session.twilioSocket);
      break;
    default:
      break;
  }
}

async function connectModel(session) {
  if (session.connecting || isSocketOpen(session.modelSocket)) return;

  const prefetched = consumePrefetchedSession(session.callSid);
  session.connecting = true;

  try {
    let clientSecret = prefetched?.secret;
    let modelId = prefetched?.model || env.MODEL_ID;

    if (!clientSecret) {
      const realtimeSession = await createRealtimeSession();
      clientSecret = realtimeSession?.client_secret?.value;
      modelId =
        realtimeSession?.session?.model ||
        realtimeSession?.session?.default_model ||
        env.MODEL_ID;
    }

    if (!clientSecret) {
      throw new Error("Realtime session response missing client secret");
    }

    const modelSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(modelId)}`,
      {
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    session.modelSocket = modelSocket;

    modelSocket.on("open", () => {
      session.connecting = false;
      configureModel(session);
    });

    modelSocket.on("message", data => handleModelMessage(session, data));
    modelSocket.on("close", () => {
      session.connecting = false;
      session.modelSocket = undefined;
      if (isSocketOpen(session.twilioSocket)) {
        session.twilioSocket.close(1011, "Realtime session ended");
      }
    });
    modelSocket.on("error", error => {
      session.connecting = false;
      err("OpenAI realtime socket error", error);
      closeSocket(modelSocket);
      if (isSocketOpen(session.twilioSocket)) {
        session.twilioSocket.close(1011, "Realtime connection failed");
      }
    });
  } catch (error) {
    session.connecting = false;
    err("Failed to start realtime session for Twilio bridge", error);
    if (isSocketOpen(session.twilioSocket)) {
      session.twilioSocket.close(1011, "Realtime session error");
    }
  }
}

function configureModel(session) {
  if (!isSocketOpen(session.modelSocket)) return;

  const voice = env.TWILIO_AGENT_VOICE || "sage";

  jsonSend(session.modelSocket, {
    type: "session.update",
    session: {
      voice,
      modalities: ["text", "audio"],
      input_audio_transcription: { model: "whisper-1" },
      input_audio_format: INPUT_AUDIO_FORMAT,
      output_audio_format: OUTPUT_AUDIO_FORMAT,
      turn_detection: { type: "server_vad" }
    }
  });
}

function handleModelMessage(session, raw) {
  const event = parseJson(raw);
  if (!event) return;

  switch (event.type) {
    case "response.audio.delta":
      forwardAudioToTwilio(session, event);
      break;
    case "conversation.item.input_audio_transcription.completed": {
      const transcript =
        typeof event.transcript === "string"
          ? event.transcript
          : typeof event.transcription === "string"
            ? event.transcription
            : "";
      logConversationEventForSession(session, {
        role: "user",
        text: transcript,
        kind: "user_transcript",
        metadata: { itemId: event.item_id }
      });
      if (transcript.trim()) {
        session.transcriptParts.push({ role: "user", text: transcript.trim() });
      }
      break;
    }
    case "response.audio_transcript.done": {
      const transcript =
        typeof event.transcript === "string"
          ? event.transcript
          : Array.isArray(event.output_text)
            ? event.output_text.join("")
            : "";
      logConversationEventForSession(session, {
        role: "assistant",
        text: transcript,
        kind: "assistant_transcript",
        metadata: { itemId: event.item_id }
      });
      if (transcript.trim()) {
        session.transcriptParts.push({ role: "assistant", text: transcript.trim() });
      }
      break;
    }
    case "response.output_text.done": {
      const transcript = Array.isArray(event.output_text)
        ? event.output_text.join("")
        : typeof event.output_text === "string"
          ? event.output_text
          : "";
      logConversationEventForSession(session, {
        role: "assistant",
        text: transcript,
        kind: "assistant_text",
        metadata: { itemId: event.item_id }
      });
      break;
    }
    case "input_audio_buffer.speech_started":
      handleTruncation(session);
      break;
    case "response.output_item.done":
      if (event.item?.type === "function_call") {
        handleFunctionCall(session, event.item).catch(error => {
          err("Tool execution failed", error);
        });
      }
      break;
    default:
      break;
  }
}

function forwardAudioToTwilio(session, event) {
  if (!isSocketOpen(session.twilioSocket) || !session.streamSid) return;

  if (session.responseStartTimestamp === undefined) {
    session.responseStartTimestamp = session.latestMediaTimestamp || 0;
  }

  if (event.item_id) {
    session.lastAssistantItem = event.item_id;
  }

  jsonSend(session.twilioSocket, {
    event: "media",
    streamSid: session.streamSid,
    media: { payload: event.delta }
  });

  jsonSend(session.twilioSocket, {
    event: "mark",
    streamSid: session.streamSid
  });
}

async function handleFunctionCall(session, item) {
  const callId = item.call_id;
  const toolName = (item.name || "").trim();
  let args;

  try {
    args = item.arguments ? JSON.parse(item.arguments) : {};
  } catch (parseError) {
    err("Failed to parse function call arguments", parseError);
    return sendFunctionResult(session, callId, {
      error: "Invalid JSON arguments"
    });
  }

  logConversationEventForSession(session, {
    role: "system",
    text: `Tool call: ${toolName || "unknown"}`,
    kind: "tool_call",
    metadata: { callId, args }
  });

  try {
    switch (toolName) {
      case "search_docs": {
        const query = (args?.query || "").trim();
        if (!query) {
          throw new Error("query is required");
        }
        const topK = Number(args?.top_k) || 5;
        const results = await searchDocs(query, topK);
        await sendFunctionResult(session, callId, { results });
        break;
      }
      case "create_lead": {
        const { name, phone, intent, email } = args || {};
        if (!name || !phone || !intent) {
          throw new Error("name, phone, intent are required");
        }
        const result = await createLead({ name, phone, intent, email });
        if (result?.lead_id) {
          session.leadId = result.lead_id;
        }
        await sendFunctionResult(session, callId, result);
        break;
      }
      default:
        warn("Received unsupported tool call", toolName);
        await sendFunctionResult(session, callId, {
          error: `Unknown tool: ${toolName}`
        });
    }
  } catch (toolError) {
    err(`Tool ${toolName} failed`, toolError);
    await sendFunctionResult(session, callId, {
      error: toolError.message || `Tool ${toolName} failed`
    });
  }
}

async function sendFunctionResult(session, callId, output) {
  if (!isSocketOpen(session.modelSocket)) return;

  jsonSend(session.modelSocket, {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(output ?? {})
    }
  });

  jsonSend(session.modelSocket, { type: "response.create" });
}

function handleTruncation(session) {
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  ) {
    return;
  }

  const elapsed =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
  const audioEndMs = elapsed > 0 ? elapsed : 0;

  if (isSocketOpen(session.modelSocket)) {
    jsonSend(session.modelSocket, {
      type: "conversation.item.truncate",
      item_id: session.lastAssistantItem,
      content_index: 0,
      audio_end_ms: audioEndMs
    });
  }

  if (isSocketOpen(session.twilioSocket) && session.streamSid) {
    jsonSend(session.twilioSocket, {
      event: "clear",
      streamSid: session.streamSid
    });
  }

  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
}

function logConversationEventForSession(session, { role, text, kind, metadata }) {
  if (!firebaseLoggingEnabled()) return;
  const conversationId = session?.conversationId || session?.callSid || session?.streamSid;
  if (!conversationId) return;

  const trimmed = (text || "").toString().trim();
  const dedupeKey = `${role || "unknown"}|${kind || "event"}|${trimmed}`;
  if (trimmed && session.loggedEvents?.has(dedupeKey)) return;
  if (trimmed && session.loggedEvents) {
    session.loggedEvents.add(dedupeKey);
  }

  recordConversationEvent({
    conversationId,
    channel: "phone",
    role: role || "system",
    text: trimmed,
    kind: kind || "event",
    metadata: {
      ...metadata,
      callSid: session?.callSid,
      streamSid: session?.streamSid
    }
  }).catch(error => warn("Firebase call log failed", error));
}

function sendIfOpen(ws, message) {
  if (isSocketOpen(ws)) {
    ws.send(message);
  }
}

function jsonSend(ws, payload) {
  if (!isSocketOpen(ws)) return;
  try {
    const message = JSON.stringify(payload);
    sendIfOpen(ws, message);
  } catch (serializationError) {
    warn("Failed to serialize WebSocket payload", serializationError);
  }
}

function closeSocket(ws) {
  if (!ws) return;
  try {
    ws.close();
  } catch (closeError) {
    warn("WebSocket close failed", closeError);
  }
}

function isSocketOpen(ws) {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

function parseJson(data) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function safeParseUrl(url, host) {
  try {
    return new URL(url || "", `http://${host || "localhost"}`);
  } catch {
    return { pathname: "" };
  }
}
