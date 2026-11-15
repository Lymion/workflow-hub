/** Session 12: automations. Workflows from workflows/*.yaml, steps tagged code / Haiku / Claude Code, run log. */
import { useEffect } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { Icon } from "../components/Icon";
import { Banner, Empty, PageHead, Sk, timeAgo } from "../components/ui";
import { useToast } from "../components/Toast";

type Step = { id: string; run: string; kind: "code" | "small-llm" | "big-llm"; about: string };
type RunStep = { id: string; run: string; kind: Step["kind"]; status: "running" | "ok" | "skipped" | "alert" | "failed"; summary?: string; ms?: number };
type Run = { id: number; workflow: string; trigger: string; status: "running" | "ok" | "alert" | "failed"; steps: RunStep[]; started_at: string; ended_at: string | null };
type Workflow = { id: string; name: string; description: string; file: string; trigger_text: string; steps: Step[]; enabled: boolean; next_run: string | null; last_run: Run | null; errors: string[]; running: boolean };
export type Review = { week: string; source: string; created_at: string; body: { summary: string; wins: string[]; stuck: string[]; next: string[] } };

const KIND: Record<Step["kind"], [string, string, string]> = {
  code: ["Code", "k-code", "Plain code, free"],
  "small-llm": ["Haiku", "k-haiku", "One small Haiku call, inside your RM10 cap"],
  "big-llm": ["Claude Code", "k-claude", "Opens Claude Code on your machine; the hub never calls a big model"],
};
const ST: Record<string, [string, string]> = { ok: ["check-c", "var(--green)"], skipped: ["spark", "var(--label-3)"], alert: ["alert", "var(--amber)"], failed: ["x-c", "var(--red)"], running: ["refresh", "var(--accent)"] };

export function Automations() {
  const toast = useToast();
  const list = useLoad(() => api.get<Workflow[]>("/automations"));
  const wfs = list.data ?? [];
  const running = wfs.some((w) => w.running || w.last_run?.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => list.reload(), 1000);
    return () => clearInterval(t);
  }, [running]);

  const runNow = async (w: Workflow) => {
    try { await api.post(`/automations/${w.id}/run`); toast(`${w.name} started.`); list.reload(); } catch (e) { toast((e as Error).message, "bad"); }
  };
  const toggle = async (w: Workflow) => {
    try { await api.put(`/automations/${w.id}`, { enabled: !w.enabled }); list.reload(); } catch (e) { toast((e as Error).message, "bad"); }
  };

  return (
    <>
      <PageHead eyebrow="Runs by itself" title="Automations" />
      <p className="text-[13px] text-label-2 -mt-3 mb-5 max-w-[640px]">Each workflow is a file in <span className="font-mono">workflows/</span>. Steps say who does the work: plain code (free), one small Haiku call, or Claude Code opened on your machine.</p>
      {list.loading && <div className="grid gap-3"><Sk h={150} r={16} /><Sk h={150} r={16} /></div>}
      {!list.loading && wfs.length === 0 && <div className="card"><Empty icon="zap" title="No workflows yet">Add a YAML file to the workflows/ folder. Start from weekly-review.yaml.</Empty></div>}
      <div className="grid gap-4">
        {wfs.map((w, i) => (
          <section key={w.id} className={`card auto-card rise ${w.enabled ? "" : "off"}`} style={{ ["--d" as string]: `${i * 40}ms` }}>
            <header className="flex flex-wrap items-start gap-3">
              <span className="auto-ic"><Icon name="zap" /></span>
              <div className="flex-1 min-w-0">
                <h2>{w.name}</h2>
                <p className="text-[13px] text-label-2 mt-0.5">{w.description}</p>
                <p className="text-xs text-label-2 mt-1.5"><Icon name="refresh" className="!w-3 !h-3 inline -mt-0.5" /> {w.trigger_text}{w.enabled && w.next_run ? ` · next ${new Date(w.next_run).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              </div>
              <label className="switch" title={w.enabled ? "On: runs on its trigger" : "Off: runs only when you press Run"}>
                <input type="checkbox" role="switch" checked={w.enabled} onChange={() => toggle(w)} aria-label={`${w.name} on`} /><span />
              </label>
              <button className="btn" disabled={w.running || !!w.errors.length} onClick={() => runNow(w)}><Icon name="play" />{w.running ? "Running…" : "Run now"}</button>
            </header>
            {w.errors.map((e) => <div key={e} className="mt-3"><Banner>{e}</Banner></div>)}
            <ol className="auto-steps" aria-label="Steps">
              {w.steps.map((s, j) => {
                const r = w.last_run?.steps.find((x) => x.id === s.id);
                return (
                  <li key={s.id}>
                    <span className={`step-kind ${KIND[s.kind]?.[1] ?? ""}`} title={KIND[s.kind]?.[2]}>{KIND[s.kind]?.[0] ?? s.kind}</span>
                    <span className="flex-1 min-w-0">
                      <b className="block text-[13px]">{j + 1}. {s.about || s.run}</b>
                      {r?.summary && <span className="block text-xs text-label-2 truncate" title={r.summary}>{r.summary}</span>}
                    </span>
                    {r && <Icon name={ST[r.status][0]} className={r.status === "running" ? "spin" : ""} style={{ color: ST[r.status][1] }} />}
                  </li>
                );
              })}
            </ol>
            {w.last_run && (
              <footer className="text-xs text-label-2 mt-2">
                Last run {timeAgo(w.last_run.started_at.replace(" ", "T"))} · {w.last_run.trigger} · <span className={w.last_run.status === "failed" ? "text-bad-text" : w.last_run.status === "alert" ? "text-warn-text" : ""}>{w.last_run.status === "ok" ? "all steps done" : w.last_run.status === "alert" ? "found a problem" : w.last_run.status}</span>
              </footer>
            )}
            {w.id === "weekly-review" && <ReviewCard key={`${w.last_run?.id}-${w.last_run?.status}`} compact />}
          </section>
        ))}
      </div>
    </>
  );
}

/** The latest weekly review. Shown on Home and under the weekly review workflow. */
export function ReviewCard({ compact = false }: { compact?: boolean }) {
  const r = useLoad(() => api.get<Review | null>("/reviews/latest"));
  const v = r.data;
  if (!v) return null;
  const Block = ({ title, items, tone }: { title: string; items: string[]; tone: string }) =>
    items.length ? <div><h4 className={`rv-h ${tone}`}>{title}</h4><ul>{items.map((x) => <li key={x}>{x}</li>)}</ul></div> : null;
  const body = (
    <>
      <p className="text-[14px] leading-relaxed">{v.body.summary}</p>
      <div className="rv-grid">
        <Block title="Wins" items={v.body.wins} tone="g" />
        <Block title="Stuck" items={v.body.stuck} tone="a" />
        <Block title="Next week" items={v.body.next} tone="b" />
      </div>
      <span className="text-[11.5px] text-label-2">{v.week} · {v.source === "template" ? "written by the hub (no Haiku call)" : v.source === "cached" ? "from cache" : "written by Haiku"}</span>
    </>
  );
  if (compact) return <div className="review compact mt-3">{body}</div>;
  return (
    <section className="rise" style={{ ["--d" as string]: "140ms" }}>
      <div className="flex items-center gap-2.5 mb-3"><h2 className="flex-1">This week</h2><a className="text-[13px] text-accent-text font-medium" href="#automations">Automations</a></div>
      <div className="card review p-5">{body}</div>
    </section>
  );
}

/** A small line on Home when the nightly hub test run failed. */
export function HealthNote() {
  const h = useLoad(() => api.get<{ ok: boolean; checked: boolean; last_run: Run | null }>("/health/hub"));
  if (!h.data?.checked || h.data.ok) return null;
  return <Banner tone="warn" action={<a className="btn btn-sm" href="#automations">Details</a>}>The hub's own tests failed last night. Claude Code was opened with the error; the log is in data/health/last-failure.md.</Banner>;
}

export const refreshAutomations = () => notifyChanged();
