import { useEffect, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import type { Project } from "../lib/types";
import { Icon } from "../components/Icon";
import { Empty, Sk, timeAgo } from "../components/ui";
import { useToast } from "../components/Toast";

export type ErrorRow = { id: number; project_id: number | null; project_name: string | null; error_text: string; cause: string; fix: string; seen_count: number; created_at: string; similarity?: number };

/** Paste an error -> old fixes appear while you type. Save cause + fix for next time. */
export function ErrorLog() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [cause, setCause] = useState("");
  const [fix, setFix] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ErrorRow[] | null>(null);
  const list = useLoad(() => api.get<ErrorRow[]>(`/errors?q=${encodeURIComponent(q)}`), [q]);
  const projects = useLoad(() => api.get<Project[]>("/projects"), [], { live: false });

  useEffect(() => {
    if (text.trim().length < 8) return setHits(null);
    const t = setTimeout(() => api.post<ErrorRow[]>("/errors/match", { error_text: text }).then(setHits).catch(() => setHits(null)), 250);
    return () => clearTimeout(t);
  }, [text]);

  const save = async () => {
    try {
      const r = await api.post<ErrorRow & { repeat: boolean }>("/errors", { error_text: text, cause, fix, project_id: projectId ? Number(projectId) : null });
      toast(r.repeat ? `Seen ${r.seen_count} times now. Fix kept.` : "Saved. Next time this error shows up, your fix comes first.");
      setText("");
      setCause("");
      setFix("");
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <div className="lib">
      <div className="grid gap-3 content-start">
        <div className="card p-4 grid gap-2.5">
          <label className="lbl" htmlFor="errtext">Paste an error</label>
          <textarea id="errtext" className="input font-mono text-[12px]" rows={6} placeholder="E (312) gpio: gpio_set_level(226): GPIO output gpio_num error" value={text} onChange={(e) => setText(e.target.value)} />
          {hits && hits.length > 0 && (
            <div className="grid gap-2">
              {hits.map((h) => (
                <div key={h.id} className="chk chk-ok !block">
                  <div className="flex items-center gap-2 mb-1"><Icon name="check-c" /><b className="flex-1">{h.similarity === 1 ? "You've fixed this before" : "Looks like an old error"}</b><span className="text-xs opacity-80">{timeAgo(h.created_at)}{h.project_name ? ` · ${h.project_name}` : ""}</span></div>
                  {h.cause && <div><b>Cause:</b> {h.cause}</div>}
                  <div><b>Fix:</b> {h.fix || "No fix saved yet."}</div>
                </div>
              ))}
            </div>
          )}
          {hits && hits.length === 0 && <p className="text-xs text-label-2">New error. Save what fixed it so it comes up next time.</p>}
          <input className="input" placeholder="Cause (one line)" aria-label="Cause" value={cause} onChange={(e) => setCause(e.target.value)} />
          <input className="input" placeholder="Fix (what worked)" aria-label="Fix" value={fix} onChange={(e) => setFix(e.target.value)} />
          <select className="input" aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={text.trim().length < 3} onClick={save}>Save to error log</button>
        </div>
      </div>
      <div className="grid gap-3 content-start min-w-0">
        <input className="input" placeholder="Search the error log" aria-label="Search the error log" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.loading ? (
          <Sk h={120} r={16} />
        ) : !list.data?.length ? (
          <div className="card"><Empty icon="bug" title={q ? "No matching errors" : "No errors logged yet"}>{q ? "Try other words from the message." : "Paste an error on the left and save its fix. Repeats then show your old fix first."}</Empty></div>
        ) : (
          list.data.map((e) => <ErrorCard key={e.id} e={e} onDeleted={list.reload} />)
        )}
      </div>
    </div>
  );
}

function ErrorCard({ e, onDeleted }: { e: ErrorRow; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <article className="card p-4 grid gap-2">
      <div className="flex items-center gap-2 text-xs text-label-2">
        <span className="flex-1">{timeAgo(e.created_at)}{e.project_name ? ` · ${e.project_name}` : ""}</span>
        {e.seen_count > 1 && <span className="chip chip-warn">Seen {e.seen_count}×</span>}
        <button className="btn btn-ghost btn-sm !px-2" aria-label="Delete entry" onClick={async () => { if (!confirm) return setConfirm(true); await api.del(`/errors/${e.id}`); onDeleted(); }}>
          {confirm ? "Delete?" : <Icon name="trash" />}
        </button>
      </div>
      <pre className="code !p-2.5 rounded-lg bg-fill !text-[12px] !whitespace-pre-wrap max-h-[140px]">{e.error_text}</pre>
      {e.cause && <div className="text-[13px]"><b>Cause:</b> {e.cause}</div>}
      <div className="text-[13px]"><b>Fix:</b> {e.fix || <span className="text-label-2">Not saved yet.</span>}</div>
    </article>
  );
}
