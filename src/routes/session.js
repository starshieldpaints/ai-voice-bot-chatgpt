import { Router } from "express";
import { createRealtimeSession } from "../services/openai.js";

const router = Router();

// GET /session -> returns ephemeral session (send this to the browser)
router.get("/", async (req, res, next) => {
  try {
    const ses = await createRealtimeSession();
    res.json(ses);
  } catch (e) {
    next(e);
  }
});

export default router;
