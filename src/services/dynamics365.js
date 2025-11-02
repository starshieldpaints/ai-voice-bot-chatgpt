import fetch from "node-fetch";
import { env } from "../config.js";
import { log, warn } from "../utils/logger.js";

const tokenCache = {
  token: null,
  expiresAt: 0
};

function splitName(fullName = "") {
  const normalized = (fullName || "").trim();
  if (!normalized) {
    return { first: "", last: "Customer" };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 1) {
    return { first: "", last: parts[0] };
  }

  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.slice(-1)[0]
  };
}

async function acquireToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams();
  params.append("client_id", env.DYNAMICS_CLIENT_ID);
  params.append("client_secret", env.DYNAMICS_CLIENT_SECRET);
  params.append("grant_type", "client_credentials");
  params.append("scope", `${env.DYNAMICS_RESOURCE_URL}/.default`);

  const tokenUrl = `https://login.microsoftonline.com/${env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || response.statusText;
    const error = new Error(`CRM auth failed: ${detail}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 2700;
  tokenCache.token = payload.access_token;
  tokenCache.expiresAt = now + expiresIn * 1000;
  return tokenCache.token;
}

export async function createLeadInDynamics({ name, phone, email, intent }) {
  if (!env.DYNAMICS_ENABLED) {
    throw new Error("CRM is not configured");
  }

  const token = await acquireToken();
  const { first, last } = splitName(name);

  const payload = {
    subject: intent || "Website voice agent lead",
    firstname: first,
    lastname: last || "Lead",
    mobilephone: phone,
    telephone1: phone,
    emailaddress1: email || undefined,
    description: intent
      ? `Voice assistant captured intent: ${intent}`
      : "Captured via voice assistant"
  };

  const requestBody = JSON.stringify(payload);
  const baseUrl = env.DYNAMICS_RESOURCE_URL.replace(/\/+$/, "");
  const requestUrl = `${baseUrl}/api/data/${env.DYNAMICS_API_VERSION}/leads`;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "OData-Version": "4.0",
      "OData-MaxVersion": "4.0"
    },
    body: requestBody
  });

  if (response.status === 401 || response.status === 403) {
    tokenCache.token = null;
    tokenCache.expiresAt = 0;
  }

  if (!response.ok && response.status !== 204) {
    let details;
    try {
      details = await response.json();
    } catch {
      details = { raw: await response.text() };
    }
    const error = new Error(`CRM lead creation failed (status ${response.status})`);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  const entityIdHeader = response.headers.get("OData-EntityId");
  let leadId = "";
  if (entityIdHeader) {
    const match = entityIdHeader.match(/\(([^)]+)\)/);
    leadId = match ? match[1] : entityIdHeader;
  } else if (response.status !== 204) {
    try {
      const body = await response.json();
      leadId = body?.leadid;
    } catch (err) {
      warn("Dynamics lead created but unable to parse response body:", err);
    }
  }

  log("Dynamics 365 lead created", leadId || "(ID unavailable)");

  return {
    ok: true,
    lead_id: leadId || null,
    source: "dynamics365"
  };
}
