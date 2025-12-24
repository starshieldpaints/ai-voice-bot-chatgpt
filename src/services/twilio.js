import twilio from "twilio";
import { env } from "../config.js";
import { log } from "../utils/logger.js";

let twilioClient;

function getClient() {
  if (!env.TWILIO_ENABLED) {
    throw new Error("Twilio is not configured");
  }
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function initiateOutboundCall({ to, metadata }) {
  const client = getClient();
  const twimlUrl = (metadata?.twimlUrl || env.TWILIO_TWIML_URL || "").trim();
  if (!twimlUrl) {
    throw new Error("TWILIO_TWIML_URL is not configured");
  }

  const callOptions = {
    to,
    from: env.TWILIO_NUMBER,
    url: twimlUrl || undefined
  };

  if (env.TWILIO_STATUS_CALLBACK_URL) {
    callOptions.statusCallback = env.TWILIO_STATUS_CALLBACK_URL;
    callOptions.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
  }

  log("Starting Twilio outbound call", callOptions);
  const call = await client.calls.create(callOptions);
  return call;
}
