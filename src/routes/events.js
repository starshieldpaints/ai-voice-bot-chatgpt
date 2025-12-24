import { Router } from "express";
import { firebaseLoggingEnabled, recordConversationEvent } from "../services/firebase.js";

const router = Router();

router.post("/log", async (req, res, next) => {
  try {
    if (!firebaseLoggingEnabled()) {
      return res.status(503).json({ error: "Firebase logging is not configured on the server." });
    }

    const conversationId =
      (req.body?.conversationId ||
        req.body?.sessionId ||
        req.body?.callSid ||
        req.body?.conversation_id ||
        "").toString().trim();

    const role = (req.body?.role || "unknown").toString().trim();
    const text = req.body?.text ?? req.body?.message ?? "";
    const channel = (req.body?.channel || "web").toString().trim() || "web";
    const kind = (req.body?.kind || "message").toString().trim() || "message";
    const metadata = req.body?.metadata || {};
    const timestamp = req.body?.timestamp;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    const result = await recordConversationEvent({
      conversationId,
      channel,
      role,
      text,
      kind,
      metadata,
      timestamp
    });

    if (!result.ok) {
      return res.status(500).json({ error: "Failed to persist conversation event" });
    }

    res.json({ ok: true, conversation_id: result.id });
  } catch (error) {
    next(error);
  }
});

export default router;
