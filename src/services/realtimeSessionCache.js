import { createRealtimeSession } from "./openai.js";
import { log, warn } from "../utils/logger.js";

const CACHE_TTL_MS = 55_000; // ephemeral sessions expire quickly; refresh if stale
const pendingSessions = new Map();

function now() {
  return Date.now();
}

function cleanupExpired() {
  const cutoff = now();
  for (const [key, entry] of pendingSessions.entries()) {
    if (!entry || entry.expiresAt <= cutoff) {
      pendingSessions.delete(key);
    }
  }
}

export async function prefetchRealtimeSession(callSid) {
  const key = (callSid || "").trim();
  if (!key || pendingSessions.has(key)) return;

  try {
    const session = await createRealtimeSession();
    const secret = session?.client_secret?.value;
    if (!secret) {
      warn("Prefetch realtime session missing client secret", session?.session?.id);
      return;
    }
    const model =
      session?.session?.model ||
      session?.session?.default_model ||
      session?.model ||
      "";

    pendingSessions.set(key, {
      secret,
      model,
      createdAt: now(),
      expiresAt: now() + CACHE_TTL_MS
    });
    cleanupExpired();
    log("Prefetched realtime session for call", key);
  } catch (error) {
    warn("Failed to prefetch realtime session", error);
  }
}

export function consumePrefetchedSession(callSid) {
  cleanupExpired();
  const key = (callSid || "").trim();
  if (!key) return null;
  const entry = pendingSessions.get(key);
  if (entry) {
    pendingSessions.delete(key);
    return entry;
  }
  return null;
}

export function clearPrefetchedSession(callSid) {
  const key = (callSid || "").trim();
  if (!key) return;
  pendingSessions.delete(key);
}
