import fetch from "node-fetch";
import { env } from "../config.js";

const INVALID_API_KEY_CODE = "invalid_api_key";

const TOOLS = [
  {
    type: "function",
    name: "search_docs",
    description: "Query StarShield documents using Azure Cognitive Search.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query describing the user's question."
        },
        top_k: {
          type: "integer",
          description: "Maximum number of documents to return (default 5).",
          minimum: 1,
          maximum: 20
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "create_lead",
    description: "Capture a qualified sales lead for follow-up.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Customer name to save with the lead."
        },
        phone: {
          type: "string",
          description: "Customer phone number in local or E.164 format."
        },
        email: {
          type: "string",
          description: "Customer email address if provided."
        },
        intent: {
          type: "string",
          description: "Summary of the customer's request or interest."
        }
      },
      required: ["name", "phone", "intent"],
      additionalProperties: false
    }
  }
];

function sanitizeErrorPayload(payload = {}) {
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone?.error?.code === INVALID_API_KEY_CODE) {
    clone.error.message = "Incorrect API key provided";
  }
  return clone;
}

export async function createRealtimeSession() {
  const body = {
    // choose the same model you selected in the portal
    model: env.MODEL_ID || "gpt-realtime-mini-2025-10-06",
    voice: "sage",
    modalities: ["audio", "text"],
    prompt: {
      id: env.PROMPT_ID, // pmpt_6901cc25...656
      version: process.env.PROMPT_VERSION || "3" // keep "3" if that's what portal shows
    },
    tools: TOOLS
  };

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // dY`� required for the current Realtime Sessions API
      "OpenAI-Beta": "realtime=v1"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: text || "Unknown error from OpenAI" } };
    }

    const error = new Error(
      payload?.error?.code === INVALID_API_KEY_CODE
        ? "OpenAI rejected the provided API key"
        : `Failed to create realtime session (status ${response.status})`
    );

    error.status = response.status;
    error.details = sanitizeErrorPayload(payload);

    throw error;
  }

  return response.json();
}
