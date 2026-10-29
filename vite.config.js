import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Local dev: React on :5173, FastAPI on :8000 (uvicorn api.index:app --port 8000)
export default defineConfig({ plugins: [react()], server: { proxy: { "/api": "http://localhost:8000" } } });
