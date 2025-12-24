import admin from "firebase-admin";
import { env } from "../config.js";
import { log, warn } from "../utils/logger.js";

let firestore;
let initialized = false;

function formatPrivateKey(raw = "") {
  return raw.replace(/\\n/g, "\n");
}

function initFirebase() {
  if (firestore) return firestore;
  if (!env.FIREBASE_ENABLED) return null;

  const projectId = (env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = formatPrivateKey(env.FIREBASE_PRIVATE_KEY || "");

  if (!projectId || !clientEmail || !privateKey) {
    warn("Firebase env vars missing; conversation logging disabled");
    return null;
  }

  try {
    const credentials = {
      projectId,
      clientEmail,
      privateKey
    };

    const options = {
      credential: admin.credential.cert(credentials)
    };

    if (env.FIREBASE_DATABASE_URL) {
      options.databaseURL = env.FIREBASE_DATABASE_URL;
    }

    admin.initializeApp(options);
    firestore = admin.firestore();
    initialized = true;
    log("Firebase logging enabled for project", projectId);
  } catch (error) {
    warn("Failed to initialize Firebase; logging disabled", error);
    firestore = null;
  }

  return firestore;
}

export function firebaseLoggingEnabled() {
  return !!initFirebase();
}

function safeText(value = "") {
  return (value || "").toString().trim().slice(0, 4000);
}

function safeMetadata(meta) {
  if (!meta || typeof meta !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch {
    return {};
  }
}

export async function recordConversationEvent({
  conversationId,
  channel = "web",
  role = "system",
  text = "",
  kind = "message",
  metadata = {},
  timestamp
} = {}) {
  const db = initFirebase();
  if (!db) return { ok: false, reason: "firebase_disabled" };

  const docId = safeText(conversationId) || `session-${Date.now()}`;
  const cleanText = safeText(text);
  const payload = {
    channel,
    role,
    text: cleanText,
    kind,
    metadata: safeMetadata(metadata),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (timestamp) {
    const maybeDate = new Date(timestamp);
    if (!Number.isNaN(maybeDate.getTime())) {
      payload.clientTimestamp = maybeDate.toISOString();
    }
  }

  try {
    const conversationRef = db.collection(env.FIREBASE_CONVERSATIONS_COLLECTION);
    const docRef = conversationRef.doc(docId);

    await Promise.all([
      docRef.collection("events").add(payload),
      docRef.set(
        {
          channel,
          lastRole: role,
          lastMessage: cleanText || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      )
    ]);

    return { ok: true, id: docId };
  } catch (error) {
    warn("Failed to write conversation event to Firebase", error);
    return { ok: false, reason: "write_failed" };
  }
}
