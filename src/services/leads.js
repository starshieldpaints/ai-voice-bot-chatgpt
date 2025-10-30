import { nanoid } from "nanoid";

export async function createLead({ name, phone, intent }) {
  // TODO: wire to Dynamics 365 / Firebase / Postgres
  const leadId = `LS-${new Date().getFullYear()}-${nanoid(6)}`;
  // For now we just pretend we saved it:
  return { ok: true, lead_id: leadId, stored: { name, phone, intent } };
}
