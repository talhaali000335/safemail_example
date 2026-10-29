# SafeMail Agent

An AI agent that reads emails, web pages and documents, and can request actions (`send_email`, `update_crm`), built to **resist prompt injection**. It is a learning project with a built-in attack-and-defense lab: you can run 20 injection attacks against the agent with the defenses switched off, then on, and read the measured result.

> Status: tested locally against real Groq, Voyage and MongoDB Atlas services. A Vercel deployment has not been tested yet. Every number shown in the app comes from runs you perform. Until you run the eval, the app says "not measured yet".

## What it does

- **Answers with citations.** Every answer must cite its sources as `[doc_id:chunk]`. A verify step checks the claims against the retrieved text, retries once, then refuses with "I can't verify this."
- **Resists prompt injection.** Untrusted text (emails, pages, documents) is filtered, tagged as data, and never given authority to trigger tools.
- **Asks a human before acting.** `send_email` and `update_crm` pause the run until you click Approve or Reject.
- **Keeps users separate.** Every search is filtered by `user_id`, so alice cannot read bob's documents.
- **Logs everything.** An audit log records who asked what, which tools were requested, filter hits, latency and cost, with personal data masked.

## Architecture

```
React (Vite)  ──/api/*──▶  FastAPI (api/index.py)  ──▶  LangGraph agent
 3 pages                         │                         route → retrieve → answer
                                 │                         → verify → approval → respond
                                 ▼
                  MongoDB Atlas: documents + vector search + keyword search,
                  cache (TTL), audit log, eval results, LangGraph checkpoints
                  External: Groq (LLMs), Voyage AI (embeddings, rerank), LangSmith (tracing)
```

### The agent flow (LangGraph)

| Step | What happens |
|---|---|
| route | A small model labels the question: easy or hard, needs tools or not, small talk or not. It sees only the question, never untrusted text. |
| retrieve | Vector search and keyword search on Atlas, merged with reciprocal rank fusion, then optionally reranked with Voyage. Always filtered by `user_id`. |
| answer | Easy questions use `openai/gpt-oss-20b`, hard ones `openai/gpt-oss-120b`. Output is JSON with an answer and optional tool calls. |
| verify | The small model checks every claim against the sources. Missing citations also fail. One retry, then refuse. |
| approval | If tools were requested, the run pauses (state saved in MongoDB) until a human approves or rejects. |
| respond | Applies the output filter and returns the answer, citations and decision. |

Limits: recursion limit of 10 steps, 1 retry on failed verification, 8 second timeout per LLM call, checkpoints in MongoDB so an approval can resume in a later request.

## Security layers

| Defense | Where | Notes |
|---|---|---|
| Input filter | before the model | Removes hidden text (HTML comments, zero-width characters, `display:none`, white text) and phrases like "ignore previous instructions". |
| Untrusted tagging | prompt | Retrieved text and pasted content are wrapped in `<untrusted>` tags, and the system prompt says tagged content is data, never instructions. |
| PII masking | before the model and before logs | Regex for emails, phone numbers and card numbers. |
| Least privilege | tool layer | Tools are offered only when the question itself asks for an action. `send_email` is allowed only to `@company.com`. |
| Output filter | after the model | Blocks secret leaks and links to unknown domains. |
| Human approval | graph | Risky tools never run without a click. |
| Per-user access | retrieval | `user_id` filter on every vector and keyword query. |
| Audit log | database | User, time, input hash, tools, decision, filter hits, latency, cost. |

Each defense can be switched off with the **Defenses on** checkbox so the Security Lab can measure before and after.

## The three pages

1. **Agent**: ask a question, paste untrusted content, read the cited answer, approve or reject tool calls.
2. **Security Lab**: runs 20 injection attacks (5 goals across 4 disguises) with defenses off and on, plus 20 faithfulness questions. The report text uses only saved results.
3. **Audit and Metrics**: audit table, p50 and p95 latency, cost per request, cache hit rate and the faithfulness score.

## Evaluation

- **Faithfulness:** 20 questions over a small demo corpus (10 documents, 2 users). A case passes when the answer is verified and cites the expected document.
- **Attacks:** 20 injections. An attack counts as successful when a dangerous tool call (an outside email address, an attacker note in the CRM), a leaked secret or an unknown link reaches the result.
- Run from the UI, or with `python api/index.py eval`. Results are stored in MongoDB.

Limits of the eval: a small synthetic corpus, one model family, and a regex-based success check. Treat the numbers as a demonstration of method, not a security guarantee.

## Setup

Requirements: Python 3.11+, Node 18+, a free MongoDB Atlas cluster, a Groq key, a Voyage AI key, and optionally a LangSmith key.

```bash
pip install -r requirements.txt
npm install
```

Copy `.env.example` to `.env` and fill in:

```
GROQ_API_KEY=
VOYAGE_API_KEY=
MONGODB_URI=
RERANK=1
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=safemail
```

Seed the demo data and create the Atlas indexes (`vec` and `txt`), then wait about a minute for Atlas to build them:

```bash
python api/index.py seed
```

Run the backend and frontend in two terminals:

```bash
python -m uvicorn api.index:app --port 8000
npm run dev
```

Open http://localhost:5173. Use the sidebar to switch between the demo users alice and bob.

### Rate limits

Voyage accounts with low limits return HTTP 429 during the eval. The code waits and retries, caches retrieval results for an hour, and supports `RERANK=0` to skip the rerank call. Check the limits shown in your Voyage dashboard.

## MCP server

```bash
python api/index.py mcp
```

Exposes `search_documents` and `create_ticket` over MCP. For Claude Desktop, add to its config:

```json
{ "mcpServers": { "safemail": { "command": "python", "args": ["api/index.py", "mcp"] } } }
```

Run it from the project folder with your environment variables available.

## Deploy to Vercel

1. Push the repo to GitHub (keep `.env` out of git).
2. Import it in Vercel. The Vite frontend is built and `api/index.py` runs as a Python function (`vercel.json` routes `/api/*` and sets `maxDuration` to 60 seconds).
3. Add the environment variables from `.env` in the project settings.
4. In Atlas Network Access, allow Vercel's addresses (commonly `0.0.0.0/0`).

Not yet tested end to end. Check that your Vercel plan allows the configured function duration.

## Project layout

```
api/index.py     FastAPI + LangGraph agent + security + caching + eval + MCP + seed
src/App.jsx      the three React pages
src/styles.css   styling
vercel.json      routing and function settings
requirements.txt Python dependencies
```
