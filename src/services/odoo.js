import fetch from "node-fetch";
import { env } from "../config.js";
import { log, warn } from "../utils/logger.js";

export async function createLeadInOdoo({ name, phone, email, intent }) {
  if (!env.ODOO_ENABLED) {
    throw new Error("Odoo CRM is not configured");
  }

  const baseUrl = env.ODOO_BASE_URL.replace(/\/+$/, "");
  const requestUrl = `${baseUrl}/api/crm.lead`;

  const payload = {
    name: intent || "Website voice agent lead",
    contact_name: (name || "").trim() || "Customer",
    phone: phone || undefined,
    mobile: phone || undefined,
    email_from: email || undefined,
    description: intent
      ? `Voice assistant captured intent: ${intent}`
      : "Captured via voice assistant",
    type: "lead"
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) delete payload[key];
  });

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ODOO_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let details;
    try {
      details = await response.json();
    } catch {
      details = { raw: await response.text() };
    }
    const error = new Error(`Odoo lead creation failed (status ${response.status})`);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  const body = await response.json();
  const leadId = body?.id || body?.result?.id || body?.result || null;

  log("Odoo CRM lead created", leadId || "(ID unavailable)");

  return {
    ok: true,
    lead_id: leadId,
    source: "odoo"
  };
}

export async function addLeadChatterNote(leadId, htmlBody) {
  if (!env.ODOO_ENABLED) {
    throw new Error("Odoo CRM is not configured");
  }
  if (!leadId) {
    warn("addLeadChatterNote called without leadId; skipping");
    return { ok: false, reason: "no_lead_id" };
  }

  const baseUrl = env.ODOO_BASE_URL.replace(/\/+$/, "");
  const requestUrl = `${baseUrl}/api/mail.message`;

  const payload = {
    model: "crm.lead",
    res_id: Number(leadId),
    body: htmlBody,
    message_type: "comment",
    subtype_xmlid: "mail.mt_note"
  };

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ODOO_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let details;
    try {
      details = await response.json();
    } catch {
      details = { raw: await response.text() };
    }
    warn("Odoo chatter note failed", response.status, details);
    return { ok: false, reason: "odoo_error", status: response.status };
  }

  log("Odoo chatter note added to lead", leadId);
  return { ok: true };
}
