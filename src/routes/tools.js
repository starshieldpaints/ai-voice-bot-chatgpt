import { Router } from "express";
import { env } from "../config.js";
import { searchDocs } from "../services/azureSearch.js";
import { createLead } from "../services/leads.js";

const router = Router();

async function handleSearchDocs(req, res) {
  if (!env.AZURE_SEARCH_ENABLED) {
    return res.status(501).json({
      error:
        "Azure Search not configured. Set AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_INDEX, AZURE_SEARCH_API_KEY to enable."
    });
  }
  const { query, top_k } = req.body || {};
  if (!query) return res.status(400).json({ error: "query is required" });
  const results = await searchDocs(query, top_k || 5);
  res.json({ results });
}

async function handleCreateLead(req, res) {
  const { name, phone, intent } = req.body || {};
  if (!name || !phone || !intent) {
    return res
      .status(400)
      .json({ error: "name, phone, intent are required" });
  }
  const result = await createLead({ name, phone, intent });
  res.json(result);
}

router.post("/search_docs", async (req, res, next) => {
  try {
    await handleSearchDocs(req, res);
  } catch (e) {
    next(e);
  }
});

router.post("/create_lead", async (req, res, next) => {
  try {
    await handleCreateLead(req, res);
  } catch (e) {
    next(e);
  }
});

router.post("/:toolName", async (req, res, next) => {
  const toolName = (req.params.toolName || "").trim();
  try {
    switch (toolName) {
      case "search_docs":
        await handleSearchDocs(req, res);
        break;
      case "create_lead":
        await handleCreateLead(req, res);
        break;
      default:
        res.status(404).json({ error: "Tool not found" });
    }
  } catch (e) {
    next(e);
  }
});

export default router;
