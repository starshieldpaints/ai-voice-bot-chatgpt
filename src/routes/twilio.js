import { Router } from "express";
import twilio from "twilio";
import { env } from "../config.js";
import { log } from "../utils/logger.js";
import { prefetchRealtimeSession, clearPrefetchedSession } from "../services/realtimeSessionCache.js";

const router = Router();

function resolveStreamUrl(req) {
  const explicit = (env.TWILIO_STREAM_URL || "").trim();
  if (explicit) return explicit;

  const host = req.get("host");
  if (!host) {
    throw new Error("Unable to determine host for Twilio Stream URL");
  }

  const scheme = req.protocol === "https" ? "wss" : "ws";
  return `${scheme}://${host}/twilio/stream`;
}

function buildTwiMLResponse(streamUrl) {
  const response = new twilio.twiml.VoiceResponse();
  response.say("Connecting you to the StarShield voice agent.");
  const connect = response.connect();
  connect.stream({ url: streamUrl });
  response.say("The call has ended.");
  return response.toString();
}

async function handleVoice(req, res, next) {
  try {
    if (!env.TWILIO_ENABLED) {
      return res
        .status(501)
        .type("application/json")
        .send({ error: "Twilio is not configured on the server." });
    }

    const callSid = (req.body?.CallSid || req.query?.CallSid || "").trim();
    if (callSid) {
      prefetchRealtimeSession(callSid);
    }

    const streamUrl = resolveStreamUrl(req);
    log("Responding with TwiML stream URL", streamUrl);
    const twiml = buildTwiMLResponse(streamUrl);
    res.type("text/xml").send(twiml);
  } catch (err) {
    next(err);
  }
}

router.post("/voice", handleVoice);
router.get("/voice", handleVoice);

router.post("/voice/completed", (req, res) => {
  const callSid = (req.body?.CallSid || "").trim();
  if (callSid) {
    clearPrefetchedSession(callSid);
  }
  res.status(204).send();
});

export default router;
