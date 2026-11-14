# Demo script (≈3 minutes)

Use a local or deployed Minimi build with OpenAI + Tavily configured. Seed historical baselines via evaluation fixtures or prior conversations; **label seeded history vs live search** while narrating.

## Prep

```bash
npm run dev
# AUTH_MODE=local_dev is fine for a single-user demo
# Ensure OPENAI_API_KEY and TAVILY_API_KEY are set
```

Optional: run deterministic evals first (`npm run eval`) to confirm golden CRM / Nov 3 / Postgres cases still pass offline.

---

## Demo 1 — CRM pricing & product updates (0:00–1:00)

**Start state:** A conversation that previously shortlisted CRM tools (or load CRM fixture context).

**Prompt:**

> We shortlisted Salesforce, HubSpot, and Zoho last time. What are their current entry-level list prices, and what changed since our last research?

**Observer should see:**

1. Memory / prior research referenced (not a blank slate)
2. `web_search` activity in the stream
3. Current pricing claims with citations
4. Comparison language vs historical snapshot when temporal intent fires
5. Clickable sources in the source panel

**If evidence is thin:** Minimi should disclose uncertainty rather than invent prices.

---

## Demo 2 — Historical recall (1:00–2:00)

**Start state:** Seeded conversation dated **2026-11-03** (or fixed-clock fixture) with a prior Q&A.

**Prompt:**

> What did we discuss on November 3 about Postgres hosting? Is that answer still correct today?

**Observer should see:**

1. Retrieval of the original question and assistant answer
2. Current verification search
3. Clear “still correct / changed / unknown” framing
4. Citations for any updated claims

---

## Demo 3 — Postgres hosting prices (2:00–3:00)

**Start state:** Prior hosting research snapshot with named providers and prices.

**Prompt:**

> Compare our previous Postgres hosting shortlist to today’s pricing for equivalent plans. Call out differences and cite sources.

**Observer should see:**

1. Historical provider list recalled
2. Fresh search
3. Comparable plan matching (not random SKUs)
4. Detected differences with evidence IDs
5. No fabricated citations

**Close:** Mention single external tool (`web_search`), Supabase Postgres + long-running API deployment, and that evals gate regressions.

---

## Recording notes

- Do not show `.env` or API keys
- Prefer same-origin production URL when available; otherwise localhost is acceptable for the video
- If live search fails, say so on camera and fall back to showing a prior successful run + `npm run eval` report — do not fabricate success
