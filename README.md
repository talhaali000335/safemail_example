# SafeMail Agent (React + FastAPI, one Vercel project)

Structure: `src/` React (Vite) | `api/index.py` FastAPI + LangGraph | `vercel.json` | `requirements.txt`

## Local
1. `pip install -r requirements.txt` and `npm install`
2. Copy `.env.example` to `.env` and fill it (Groq, Voyage, MongoDB Atlas, LangSmith optional). Load it into your shell.
3. `python api/index.py seed` (loads demo docs and creates the Atlas indexes; wait ~1 min)
4. `uvicorn api.index:app --port 8000` and in another terminal `npm run dev`
5. `python api/index.py eval` runs the 20 questions and 20 attacks and saves the results.
   `python api/index.py mcp` starts the MCP server (see the comment in api/index.py for the Claude Desktop config).

## Deploy
Push to GitHub, import the repo in Vercel (framework: Vite), add the env vars, deploy.
