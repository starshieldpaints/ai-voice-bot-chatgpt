import fetch from "node-fetch";
import { env } from "../config.js";
import { addLeadChatterNote } from "./odoo.js";
import { firebaseLoggingEnabled, recordConversationEvent } from "./firebase.js";
import { log, warn } from "../utils/logger.js";

export async function generateSummary(transcriptParts) {
  if (!transcriptParts || transcriptParts.length === 0) {
    return null;
  }

  const transcriptText = transcriptParts
    .map(part => `${part.role === "user" ? "Customer" : "Agent"}: ${part.text}`)
    .join("\n");

  const systemPrompt = `You are a call summary assistant. Given a transcript of a voice call between a customer and the StarShield paints voice agent, produce a structured JSON summary with these fields:
- "topic": A one-line description of what the call was about
- "key_points": An array of 3-5 bullet points capturing the most important information discussed
- "action_items": An array of any follow-up actions mentioned or implied
- "outcome": A one-line description of how the call concluded (e.g., "Customer expressed interest in product X", "Lead captured for follow-up")

Return ONLY valid JSON, no markdown fences or extra text.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the call transcript:\n\n${transcriptText}` }
      ],
      temperature: 0.3,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Summary generation failed (status ${response.status}): ${text}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    warn("Summary JSON parse failed; using raw text");
    parsed = {
      topic: "Call summary",
      key_points: [content],
      action_items: [],
      outcome: "See summary text"
    };
  }

  return {
    topic: parsed.topic || "Call summary",
    keyPoints: parsed.key_points || [],
    actionItems: parsed.action_items || [],
    outcome: parsed.outcome || "",
    rawSummary: content
  };
}

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSummaryAsHtml(summary) {
  const points = (summary.keyPoints || [])
    .map(p => `<li>${escapeHtml(p)}</li>`)
    .join("");
  const actions = (summary.actionItems || [])
    .map(a => `<li>${escapeHtml(a)}</li>`)
    .join("");

  return `<h3>Call Summary</h3>
<p><strong>Topic:</strong> ${escapeHtml(summary.topic)}</p>
${points ? `<p><strong>Key Points:</strong></p><ul>${points}</ul>` : ""}
${actions ? `<p><strong>Action Items:</strong></p><ul>${actions}</ul>` : ""}
<p><strong>Outcome:</strong> ${escapeHtml(summary.outcome)}</p>`;
}

export async function generateAndStoreSummary({ conversationId, leadId, transcriptParts, channel = "phone" }) {
  if (!transcriptParts || transcriptParts.length === 0) {
    log("No transcript to summarize for conversation", conversationId);
    return;
  }

  try {
    log("Generating summary for conversation", conversationId, `(${transcriptParts.length} transcript parts)`);
    const summary = await generateSummary(transcriptParts);
    if (!summary) return;

    const promises = [];

    if (leadId && env.ODOO_ENABLED) {
      const html = formatSummaryAsHtml(summary);
      promises.push(
        addLeadChatterNote(leadId, html).catch(err => {
          warn("Failed to store summary in Odoo:", err);
        })
      );
    }

    if (firebaseLoggingEnabled()) {
      promises.push(
        recordConversationEvent({
          conversationId,
          channel,
          role: "system",
          text: summary.rawSummary,
          kind: "call_summary",
          metadata: {
            topic: summary.topic,
            keyPoints: summary.keyPoints,
            actionItems: summary.actionItems,
            outcome: summary.outcome,
            leadId: leadId || null
          }
        }).catch(err => {
          warn("Failed to store summary in Firebase:", err);
        })
      );
    }

    await Promise.all(promises);
    log("Summary stored for conversation", conversationId);
  } catch (error) {
    warn("Summary generation/storage failed for conversation", conversationId, error);
  }
}
