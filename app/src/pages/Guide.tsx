import { useState } from "react";
import { openDoc } from "../lib/opendoc";
import { api, notifyChanged, useLoad } from "../lib/api";
import type { Project } from "../lib/types";
import { copyText } from "../lib/snippets";
import { Icon } from "../components/Icon";
import { Banner, Check, PageHead } from "../components/ui";
import { useToast } from "../components/Toast";

type Card = { source_id: string; title: string; url: string; kind: string; why: string; apply_it: string; snippet: string };
type Answer = {
  status: "sent" | "cached" | "blocked" | "no_key" | "error" | "refused" | "no_sources";
  cards: Card[];
  sources: { id: string; kind: string; title: string; url: string }[];
  past_errors: { id: number; error_text: string; cause: string; fix: string; similarity: number }[];
  message: string;
  level: number;
  cost_rm?: number;
};

const LEVELS = [
  { n: 1, label: "Point me to the docs" },
  { n: 2, label: "Bigger hint" },
  { n: 3, label: "Tiny snippet" },
];

export function Guide() {
  const toast = useToast();
  const projects = useLoad(() => api.get<Project[]>("/projects"), [], { live: false });
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [more, setMore] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [fileText, setFileText] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Answer | null>(null);

  const ask = async (level = 1) => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const r = await api.post<Answer>("/guide/ask", { question: q, level, project_id: projectId ? Number(projectId) : null, error_text: errorText, file_text: fileText });
      setA(r);
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const open = (url: string, title?: string) => openDoc(url, title);

  return (
    <>
      <PageHead eyebrow="Saved docs, handbook and your error log" title="Ask docs" />
      <p className="text-[13px] text-label-2 -mt-3 mb-4 max-w-[640px]">Answers from pages saved on your laptop, with snippets. To find any page in the official docs online, use <a className="text-accent-text font-medium" href="#docs">Docs</a>.</p>
      <div className="card p-4 grid gap-3 rise max-w-[880px]">
        <textarea
          className="input text-[15px]"
          rows={2}
          placeholder="Why does pulseIn return 0 on my ESP32?"
          aria-label="Question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(1);
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !h-9 !w-auto text-[13px]" aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All docs</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" aria-expanded={more} onClick={() => setMore((m) => !m)}><Icon name={more ? "down" : "chev"} />More: attach error or code</button>
          <span className="flex-1" />
          <span className="text-xs text-label-2">Enter to ask · free search first, one small Haiku call</span>
          <button className="btn btn-primary" disabled={busy || q.trim().length < 3} onClick={() => ask(1)}>{busy ? "Asking…" : "Ask"}</button>
        </div>
        {more && (
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <textarea className="input font-mono text-[12px]" rows={4} placeholder="Paste the error text" aria-label="Error text" value={errorText} onChange={(e) => setErrorText(e.target.value)} />
            <textarea className="input font-mono text-[12px]" rows={4} placeholder="Paste the code you're working on" aria-label="Current file" value={fileText} onChange={(e) => setFileText(e.target.value)} />
          </div>
        )}
      </div>

      {a && (
        <div className="grid gap-4 mt-5 max-w-[880px] rise">
          {a.past_errors.length > 0 && (
            <div className="grid gap-2">
              {a.past_errors.slice(0, 2).map((e) => (
                <Check key={e.id} level="ok"><b>{e.similarity === 1 ? "You fixed this before:" : "Similar old error:"}</b> {e.fix || "no fix saved"}{e.cause ? ` (cause: ${e.cause})` : ""}</Check>
              ))}
            </div>
          )}
          {a.message && a.status !== "sent" && a.status !== "cached" && (
            <Banner tone={a.status === "blocked" || a.status === "error" ? "bad" : "warn"} action={a.status === "no_key" ? <a className="btn btn-sm" href="#settings">Settings</a> : undefined}>{a.message}</Banner>
          )}
          {a.cards.map((c, i) => (
            <article key={i} className="card p-5 grid gap-3">
              <div className="flex items-start gap-3">
                <span className="tile tile-sm" style={{ background: c.kind === "handbook" ? "linear-gradient(160deg,#FFA94D,#F56300)" : "linear-gradient(160deg,#5AA9FF,#0071E3)" }}><Icon name={c.kind === "handbook" ? "book" : "external"} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-bold text-good-text">Read this</div>
                  <button className="text-left font-semibold text-[15px] text-accent-text hover:underline" onClick={() => open(c.url)}>{c.title}</button>
                </div>
                {i === 0 && (a.status === "cached" ? <span className="chip chip-ok">From cache · free</span> : a.cost_rm ? <span className="chip num">RM{a.cost_rm.toFixed(4)}</span> : null)}
              </div>
              <div className="text-[13.5px]"><b className="text-[11.5px] text-label-2 block">Why</b>{c.why}</div>
              <div className="text-[13.5px]"><b className="text-[11.5px] text-label-2 block">Apply it</b>{c.apply_it}</div>
              {c.snippet && (
                <div className="code-card">
                  <div className="code-head"><Icon name="code" className="text-label-2" /><b className="flex-1 text-[12.5px]">Snippet</b><button className="btn btn-ghost btn-sm" onClick={async () => toast((await copyText(c.snippet)) ? "Snippet copied." : "Select the snippet and copy it.")}><Icon name="copy" />Copy</button></div>
                  <pre className="code">{c.snippet}</pre>
                </div>
              )}
            </article>
          ))}
          {(a.status === "sent" || a.status === "cached") && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-label-2">Still stuck?</span>
              {LEVELS.filter((l) => l.n > a.level).map((l) => (
                <button key={l.n} className="btn btn-tinted btn-sm" disabled={busy} onClick={() => ask(l.n)}>{l.label}</button>
              ))}
              {a.level === 3 && <span className="text-xs text-label-2">That's the biggest hint. Save the fix to your error log once it works.</span>}
            </div>
          )}
          {a.sources.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 text-[12.5px] text-label-2">Search results (free)</h3>
              {a.sources.map((s) => (
                <button key={s.id} className="snip w-full text-left" onClick={() => open(s.url)}>
                  <span className="lang">{s.kind === "handbook" ? "book" : "doc"}</span>
                  <span className="flex-1 min-w-0 truncate font-medium text-[13px]">{s.title}</span>
                  <Icon name={s.url.startsWith("#") ? "chev" : "external"} className="text-label-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
