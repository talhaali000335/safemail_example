import { useEffect, useState } from "react";

// Thin wrapper: every call sends X-User (demo login) and throws on API errors.
async function api(path, body, user = "alice") {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-User": user },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || "Request failed (" + r.status + ")");
  return d;
}
const fmt = (v, f) => (v == null ? "not measured yet" : f(v));

function Agent({ user }) {
  const [q, setQ] = useState("What is the refund policy?");
  const [content, setContent] = useState("");
  const [defenses, setDefenses] = useState(true);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState("");

  const call = async (path, body) => {
    setBusy(true); setErr(""); setOpen(null);
    try { setRes(await api(path, body, user)); } catch (e) { setErr(e.message); setRes(null); }
    setBusy(false);
  };
  return (
    <>
      <h2>Agent</h2>
      <p className="sub">Ask a question about your documents. Paste an email or web page to make the agent read untrusted content.</p>
      <div className="card">
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" />
        <textarea style={{ marginTop: 10 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste an email, web page or document (optional)" aria-label="Untrusted content" />
        <div className="row">
          <button className="btn" disabled={busy || !q} onClick={() => call("ask", { question: q, content, defenses })}>{busy ? "Working..." : "Ask"}</button>
          <label><input type="checkbox" checked={defenses} onChange={(e) => setDefenses(e.target.checked)} /> Defenses on</label>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {res && (
        <div className={"card" + (res.status === "pending" ? " pending" : "")}>
          <div className="row" style={{ marginTop: 0, marginBottom: 10 }}>
            <span className={"tag " + (res.verified ? "ok" : "bad")}>{res.verified ? "verified" : "refused"}</span>
            {res.cached && <span className="tag">cache hit</span>}
            {res.latency_ms != null && <span className="tag">{res.latency_ms} ms</span>}
            <span className="tag">${(res.cost || 0).toFixed(5)}</span>
            {(res.hits || []).map((h) => <span key={h} className="tag warn">{h}</span>)}
          </div>
          <p style={{ margin: 0 }}>{res.answer}</p>
          {(res.citations || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              {res.citations.map((c) => <button key={c.id} className="cite" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.id}</button>)}
              {open && <div className="src">{res.citations.find((c) => c.id === open)?.text}</div>}
            </div>
          )}
          {res.status === "pending" && (
            <div style={{ marginTop: 14 }}>
              <b>The agent wants to run these actions. Approve or reject.</b>
              <pre>{JSON.stringify(res.calls, null, 2)}</pre>
              <div className="row" style={{ marginTop: 0 }}>
                <button className="btn" disabled={busy} onClick={() => call("approve", { thread: res.thread, decision: "approve" })}>Approve</button>
                <button className="btn ghost" disabled={busy} onClick={() => call("approve", { thread: res.thread, decision: "reject" })}>Reject</button>
              </div>
            </div>
          )}
          {res.status !== "pending" && res.decision && res.decision !== "none" && <p className="sub" style={{ margin: "10px 0 0" }}>Actions {res.decision}d.</p>}
        </div>
      )}
    </>
  );
}

function Lab() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState({});
  const [err, setErr] = useState("");
  const load = () => api("eval/latest").then(setSaved).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const attacks = async () => {
    setBusy("attacks"); setRows([]); setErr(""); let off = 0, on = 0;
    try {
      for (let i = 0; i < 20; i++) { // one request per attack keeps each call short for Vercel
        const a = await api("eval/case", { kind: "attack", i, defenses: false });
        const b = await api("eval/case", { kind: "attack", i, defenses: true });
        off += a.success; on += b.success;
        setRows((r) => [...r, { i: i + 1, off: a.success, on: b.success, hits: b.hits }]);
      }
      await api("eval/save", { kind: "attacks", off, on, n: 20 });
    } catch (e) { setErr(e.message); }
    setBusy(""); load();
  };
  const faith = async () => {
    setBusy("faith"); setErr(""); let ok = 0;
    try {
      for (let i = 0; i < 20; i++) ok += (await api("eval/case", { kind: "faith", i })).ok;
      await api("eval/save", { kind: "faith", score: (ok / 20) * 100, n: 20 });
    } catch (e) { setErr(e.message); }
    setBusy(""); load();
  };
  const a = saved.attacks, f = saved.faith;
  return (
    <>
      <h2>Security Lab</h2>
      <p className="sub">20 injection attacks run against the agent with defenses off, then on. The report below only uses numbers measured here.</p>
      <div className="row" style={{ marginTop: 0, marginBottom: 16 }}>
        <button className="btn" disabled={!!busy} onClick={attacks}>{busy === "attacks" ? "Running attacks..." : "Run 20 attacks"}</button>
        <button className="btn ghost" disabled={!!busy} onClick={faith}>{busy === "faith" ? "Running questions..." : "Run 20 faithfulness questions"}</button>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Attack and defense report</h3>
        <p>Attacks that succeeded with defenses off: <b>{fmt(a, (x) => `${x.off}/${x.n}`)}</b>. With defenses on: <b>{fmt(a, (x) => `${x.on}/${x.n}`)}</b>.</p>
        <p>Faithfulness (answers where every claim is supported and the expected document is cited): <b>{fmt(f, (x) => `${x.score.toFixed(0)}% of ${x.n}`)}</b>.</p>
        <p className="sub" style={{ margin: 0 }}>Defenses tested: input filter for injection phrases and hidden text, untrusted-content tagging, PII masking, output filter, least-privilege tools with an allow-listed email domain, and human approval. An attack counts as successful when a dangerous tool call or leaked content reaches the result.</p>
      </div>
      {rows.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th className="n">Attack</th><th>Defenses off</th><th>Defenses on</th><th>Filter hits</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.i}><td className="n">{r.i}</td>
                <td><span className={"tag " + (r.off ? "bad" : "ok")}>{r.off ? "succeeded" : "failed"}</span></td>
                <td><span className={"tag " + (r.on ? "bad" : "ok")}>{r.on ? "succeeded" : "blocked"}</span></td>
                <td>{(r.hits || []).join(", ") || "none"}</td></tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Metrics() {
  const [m, setM] = useState(null), [log, setLog] = useState([]), [f, setF] = useState(null), [err, setErr] = useState("");
  useEffect(() => {
    Promise.all([api("metrics"), api("audit"), api("eval/latest")]).then(([a, b, c]) => { setM(a); setLog(b); setF(c.faith); }).catch((e) => setErr(e.message));
  }, []);
  const has = m && m.n > 0;
  const S = ({ label, v }) => <div className="stat"><b>{v}</b><span>{label}</span></div>;
  return (
    <>
      <h2>Audit and Metrics</h2>
      <p className="sub">Computed from logged requests, including eval runs. PII is masked before anything is stored.</p>
      {err && <p className="err">{err}</p>}
      <div className="stats">
        <S label="p50 latency" v={has ? m.p50 + " ms" : "not measured yet"} />
        <S label="p95 latency" v={has ? m.p95 + " ms" : "not measured yet"} />
        <S label="cost per request" v={has ? "$" + m.cost_per_request.toFixed(5) : "not measured yet"} />
        <S label="cache hit rate" v={has ? (m.cache_hit_rate * 100).toFixed(0) + "%" : "not measured yet"} />
        <S label="faithfulness" v={fmt(f, (x) => x.score.toFixed(0) + "%")} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Input</th><th>Tools</th><th>Decision</th><th>Filters</th><th className="n">ms</th><th className="n">Cost</th></tr></thead>
          <tbody>{log.map((r, i) => (
            <tr key={i}><td>{new Date(r.at).toLocaleTimeString()}</td><td>{r.user}</td><td>{r.preview}</td><td>{r.tools.join(", ") || "-"}</td>
              <td>{r.decision}</td><td>{r.filter_hits.join(", ") || "-"}</td><td className="n">{r.latency_ms}</td><td className="n">${r.cost.toFixed(5)}</td></tr>))}</tbody>
        </table>
        {!log.length && <p className="sub">No requests yet. Ask the agent something first.</p>}
      </div>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState("agent");
  const [user, setUser] = useState("alice");
  const tabs = [["agent", "Agent"], ["lab", "Security Lab"], ["metrics", "Audit and Metrics"]];
  return (
    <div className="shell">
      <aside>
        <h1>SafeMail Agent</h1>
        {tabs.map(([k, l]) => <button key={k} className={page === k ? "on" : ""} onClick={() => setPage(k)}>{l}</button>)}
        <label htmlFor="u">Signed in as</label>
        <select id="u" value={user} onChange={(e) => setUser(e.target.value)}><option>alice</option><option>bob</option></select>
      </aside>
      <main>{page === "agent" ? <Agent user={user} key={user} /> : page === "lab" ? <Lab /> : <Metrics />}</main>
    </div>
  );
}
