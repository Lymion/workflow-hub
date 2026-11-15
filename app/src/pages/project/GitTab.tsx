/** Session 11: git helper. Changed files, Haiku commit message (free template fallback), commit + push. */
import { useEffect, useRef, useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { burst } from "../../lib/celebrate";
import { Icon } from "../../components/Icon";
import { Check, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

type GFile = { path: string; status: string; staged: boolean; secret: boolean };
type Status = { repo: boolean; branch: string | null; upstream: string | null; ahead: number; behind: number; remote: string | null; files: GFile[]; has_commits?: boolean;
  log: { hash: string; subject: string; author: string; when: string }[]; warnings: string[] };
type Msg = { message: string; source: "sent" | "cached" | "template"; cost_rm: number; note: string; truncated: boolean; skipped_secrets: string[] };

const LETTER: Record<string, [string, string]> = { new: ["A", "g-add"], added: ["A", "g-add"], modified: ["M", "g-mod"], deleted: ["D", "g-del"], renamed: ["R", "g-mod"], conflict: ["!", "g-del"] };

export function GitTab({ project }: TabProps) {
  const toast = useToast();
  const st = useLoad(() => api.get<Status>(`/projects/${project.id}/git`), [project.id]);
  const s = st.data;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [meta, setMeta] = useState<Msg | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const fileKey = (s?.files ?? []).map((f) => f.path + f.status).join();

  // tick every non-secret file when the list changes
  useEffect(() => { setPicked(new Set((s?.files ?? []).filter((f) => !f.secret).map((f) => f.path))); }, [fileKey]);
  useEffect(() => {
    if (!open) return setDiff("");
    api.get<{ diff: string }>(`/projects/${project.id}/git/diff?file=${encodeURIComponent(open)}`).then((r) => setDiff(r.diff)).catch(() => setDiff(""));
  }, [open, fileKey]);

  if (st.loading) return <div className="grid gap-3"><Sk h={80} r={16} /><Sk h={300} r={16} /></div>;
  if (st.error || !s) return <div className="card"><Empty icon="git" title="Git isn't available">{st.error}</Empty></div>;

  const init = async () => {
    try { await api.post(`/projects/${project.id}/git/init`); st.reload(); toast("Git is set up. Your first commit is one click away."); } catch (e) { toast((e as Error).message, "bad"); }
  };
  if (!s.repo) {
    return <div className="card"><Empty icon="git" title="Not a git repo yet" action={<button className="btn btn-primary" onClick={init}><Icon name="git" />Start git</button>}>Git keeps every version of your code so you can undo mistakes and push to GitHub.</Empty></div>;
  }

  const files = s.files;
  const chosen = files.filter((f) => picked.has(f.path)).map((f) => f.path);
  const write = async () => {
    setWriting(true);
    try {
      const r = await api.post<Msg>(`/projects/${project.id}/git/message`, { files: chosen });
      setMessage(r.message);
      setMeta(r);
      notifyChanged();
    } catch (e) { toast((e as Error).message, "bad"); } finally { setWriting(false); }
  };
  const commit = async () => {
    setBusy(true);
    try {
      const r = await api.post<Status & { commit: string; pushed: boolean; push_error: string }>(`/projects/${project.id}/git/commit`, { message, files: chosen, push: !!s.remote });
      if (r.push_error) toast(`Committed ${r.commit}, but the push failed. ${r.push_error}`, "bad");
      else toast(r.pushed ? `Committed ${r.commit} and pushed to ${r.upstream ?? r.remote}.` : `Committed ${r.commit}.`);
      if (btn.current) burst(btn.current, 12, 34);
      setMessage(""); setMeta(null); setOpen(null);
      st.reload();
    } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const push = async () => {
    setBusy(true);
    try { await api.post(`/projects/${project.id}/git/push`); toast("Pushed."); st.reload(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };

  return (
    <div className="git-grid">
      <div className="grid gap-4 min-w-0">
        <section className="card p-5 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1">Changes</h2>
            <span className="chip"><Icon name="git" className="!w-3.5 !h-3.5" />{s.branch}</span>
            {s.remote ? <span className="chip">{s.upstream ?? `${s.remote} (not pushed yet)`}</span> : <span className="chip chip-warn">No GitHub remote</span>}
            {s.ahead > 0 && <span className="chip chip-app num">↑ {s.ahead} to push</span>}
            {s.behind > 0 && <span className="chip chip-warn num">↓ {s.behind} to pull</span>}
          </div>
          {s.warnings.map((w) => <Check key={w} level="warn">{w}</Check>)}
          {files.length === 0 ? (
            <div className="flex items-center gap-3 py-2 text-[13.5px] text-label-2"><Icon name="check-c" style={{ color: "var(--green)" }} />Everything is committed.{s.ahead > 0 && s.remote && <button className="btn btn-sm ml-auto" disabled={busy} onClick={push}>Push {s.ahead}</button>}</div>
          ) : (
            <ul className="git-files" aria-label="Changed files">
              <li className="git-all">
                <label><input type="checkbox" checked={chosen.length === files.filter((f) => !f.secret).length} onChange={(e) => setPicked(new Set(e.target.checked ? files.filter((f) => !f.secret).map((f) => f.path) : []))} />
                  <span className="text-xs text-label-2">{chosen.length} of {files.length} files</span></label>
              </li>
              {files.map((f) => (
                <li key={f.path} className={open === f.path ? "on" : ""}>
                  <input type="checkbox" aria-label={`Include ${f.path}`} checked={picked.has(f.path)} disabled={f.secret} title={f.secret ? "Secret files are never committed" : undefined}
                    onChange={(e) => { const n = new Set(picked); e.target.checked ? n.add(f.path) : n.delete(f.path); setPicked(n); }} />
                  <span className={`g-letter ${LETTER[f.status]?.[1] ?? "g-mod"}`}>{LETTER[f.status]?.[0] ?? "M"}</span>
                  <button className="git-name" onClick={() => setOpen(open === f.path ? null : f.path)} aria-expanded={open === f.path}>{f.path}</button>
                  {f.secret && <span className="chip chip-bad">secret</span>}
                </li>
              ))}
            </ul>
          )}
          {open && (
            <div className="code-card">
              <div className="code-head"><Icon name="code" className="text-label-2" /><b className="flex-1 font-mono text-[12.5px] truncate">{open}</b><button className="btn btn-ghost btn-sm !px-2" aria-label="Close diff" onClick={() => setOpen(null)}><Icon name="x" /></button></div>
              <pre className="code diff max-h-[360px] overflow-auto">{diff.split("\n").map((l, i) => <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : ""}>{l || " "}{"\n"}</span>)}</pre>
            </div>
          )}
        </section>
        {files.length > 0 && (
          <section className="card p-5 grid gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="commit-msg" className="flex-1"><h2>Commit message</h2></label>
              <button className="btn btn-tinted" disabled={writing || chosen.length === 0} onClick={write}><Icon name="spark" className={writing ? "spin" : ""} />{writing ? "Writing…" : "Write with Haiku"}</button>
            </div>
            <textarea id="commit-msg" className="input font-mono !text-[13px]" rows={4} placeholder="What changed and why, e.g. Slow motors near obstacles" value={message} onChange={(e) => setMessage(e.target.value)} />
            {meta && (
              <p className="text-xs text-label-2">
                {meta.source === "template" ? meta.note : meta.source === "cached" ? "From cache. No call made." : `Written by Haiku · RM${meta.cost_rm.toFixed(4)}`}
                {meta.truncated && " · Big diff: Haiku saw the file list and the first part."}
                {meta.skipped_secrets.length > 0 && ` · ${meta.skipped_secrets.join(", ")} never sent.`}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs text-label-2 flex-1">{s.remote ? `Commits ${chosen.length} file${chosen.length === 1 ? "" : "s"} and pushes to ${s.remote}.` : `Commits ${chosen.length} file${chosen.length === 1 ? "" : "s"}. Add a GitHub remote to push: gh repo create --private --source=. --push`}</span>
              <button ref={btn} className="btn btn-primary" disabled={busy || message.trim().length < 3 || chosen.length === 0} onClick={commit}><Icon name="check" />{busy ? "Working…" : s.remote ? "Commit & push" : "Commit"}</button>
            </div>
          </section>
        )}
      </div>
      <aside className="card p-4 git-log" aria-label="Recent commits">
        <h3 className="mb-2">Recent commits</h3>
        {s.log.length === 0 ? <p className="text-xs text-label-2">No commits yet.</p> : (
          <ol>
            {s.log.map((c) => (
              <li key={c.hash}><b className="block text-[13px] leading-snug">{c.subject}</b><span className="text-[11.5px] text-label-2"><span className="font-mono">{c.hash}</span> · {c.when}</span></li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
