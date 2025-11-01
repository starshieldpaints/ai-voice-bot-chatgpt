import { nanoid } from "nanoid";
import { env } from "../config.js";
import { createLeadInDynamics } from "./dynamics365.js";
import { log, warn } from "../utils/logger.js";

export async function createLead({ name, phone, intent, email }) {
  if (env.DYNAMICS_ENABLED) {
    try {
      const result = await createLeadInDynamics({ name, phone, intent, email });
      return {
        ...result,
        stored: { name, phone, intent, email }
      };
    } catch (err) {
      warn("Dynamics 365 lead creation failed:", err);
      throw err;
    }
  }

  const leadId = `LS-${new Date().getFullYear()}-${nanoid(6)}`;
  log("Dynamics 365 not configured; returning stub lead", leadId);
  return { ok: true, lead_id: leadId, stored: { name, phone, intent, email }, source: "stub" };
}
