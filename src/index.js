import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config.js";
import { notFound, errorHandler } from "./utils/errors.js";
import sessionRouter from "./routes/session.js";
import toolsRouter from "./routes/tools.js";
import twilioRouter from "./routes/twilio.js";
import eventsRouter from "./routes/events.js";
import { attachTwilioBridge } from "./services/twilioBridge.js";

const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "2mb" }));
// after app.use(morgan("dev"));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(new URL("../public/index.html", import.meta.url).pathname);
});

const origins = (env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(morgan("dev"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/session", sessionRouter);
app.use("/tool", toolsRouter);
app.use("/twilio", twilioRouter);
app.use("/events", eventsRouter);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[voice-agent] Voice backend running on http://localhost:${env.PORT}`);
});

attachTwilioBridge(server);

export default server;
