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

  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", "")
};
