import dotenv from "dotenv";
dotenv.config({override: true});

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}
const optional = (name, def = "") => process.env[name] ?? def;

const hasSearch =
  !!process.env.AZURE_SEARCH_ENDPOINT &&
  !!process.env.AZURE_SEARCH_INDEX &&
  !!process.env.AZURE_SEARCH_API_KEY;

const odooVars = ["ODOO_BASE_URL", "ODOO_API_KEY"];
const hasOdoo = odooVars.every(key => !!process.env[key]);

const twilioVars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_NUMBER", "TWILIO_TWIML_URL"];
const hasTwilio = twilioVars.every(key => !!process.env[key]);

const firebaseVars = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
const hasFirebase = firebaseVars.every(key => !!process.env[key]);

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: optional("PORT", 3001),

  // Required to start the server
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  MODEL_ID: optional("MODEL_ID", "gpt-realtime-mini-2025-10-06"),

  // Azure Search is optional (enable only if all 3 are present)
  AZURE_SEARCH_ENABLED: hasSearch,
  AZURE_SEARCH_ENDPOINT: optional("AZURE_SEARCH_ENDPOINT"),
  AZURE_SEARCH_INDEX: optional("AZURE_SEARCH_INDEX"),
  AZURE_SEARCH_API_KEY: optional("AZURE_SEARCH_API_KEY"),

  // Prompt ID (optional but recommended)
  PROMPT_ID: optional("PROMPT_ID", ""),

  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", ""),

  // Odoo CRM (optional; enable only if all required env vars are present)
  ODOO_ENABLED: hasOdoo,
  ODOO_BASE_URL: optional("ODOO_BASE_URL"),
  ODOO_API_KEY: optional("ODOO_API_KEY"),

  // Twilio outbound calling + TwiML webhook (optional; enable only if all required env vars are present)
  TWILIO_ENABLED: hasTwilio,
  TWILIO_ACCOUNT_SID: optional("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: optional("TWILIO_AUTH_TOKEN"),
  TWILIO_NUMBER: optional("TWILIO_NUMBER"),
  TWILIO_TWIML_URL: optional("TWILIO_TWIML_URL"),
  TWILIO_STATUS_CALLBACK_URL: optional("TWILIO_STATUS_CALLBACK_URL", ""),
  TWILIO_STREAM_URL: optional("TWILIO_STREAM_URL", ""),

  // Firebase (optional; enable only if all credentials are present)
  FIREBASE_ENABLED: hasFirebase,
  FIREBASE_PROJECT_ID: optional("FIREBASE_PROJECT_ID"),
  FIREBASE_CLIENT_EMAIL: optional("FIREBASE_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: optional("FIREBASE_PRIVATE_KEY"),
  FIREBASE_DATABASE_URL: optional("FIREBASE_DATABASE_URL"),
  FIREBASE_CONVERSATIONS_COLLECTION: optional("FIREBASE_CONVERSATIONS_COLLECTION", "conversations")
};
