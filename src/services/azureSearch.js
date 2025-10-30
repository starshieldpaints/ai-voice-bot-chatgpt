import fetch from "node-fetch";
import { env } from "../config.js";

export async function searchDocs(query, topK = 5) {
  const url = `${env.AZURE_SEARCH_ENDPOINT}/indexes/${env.AZURE_SEARCH_INDEX}/docs/search?api-version=2023-11-01`;
  const payload = {
    search: query,
    top: topK
  };

  if (process.env.AZURE_SEARCH_SEMANTIC_CONFIG) {
    payload.queryType = "semantic";
    payload.semanticConfiguration = process.env.AZURE_SEARCH_SEMANTIC_CONFIG;
    payload.queryLanguage = "en-us";
  }

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.AZURE_SEARCH_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Azure Search error: ${t}`);
  }

  const json = await r.json();
  return (json.value || []).map(d => {
    const title =
      d.metadata_storage_name ||
      d.title ||
      d.name ||
      d.id ||
      "Result";
    const snippetSource =
      d.content ||
      d.text ||
      d.description ||
      d.summary ||
      JSON.stringify(d);

    return {
      title,
      // keep snippet short to avoid flooding function output
      snippet: typeof snippetSource === "string" ? snippetSource.slice(0, 800) : ""
    };
  });
}
