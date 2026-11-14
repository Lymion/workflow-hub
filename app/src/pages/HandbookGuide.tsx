/** Session 12: handbook guide mode. Answer a few questions; the chapters to read rank themselves (plain code). */
import { useEffect, useState } from "react";
import { api, useLoad } from "../lib/api";
import { Icon } from "../components/Icon";
import { Empty, Sk } from "../components/ui";

type Question = { id: string; q: string; multi?: boolean; options: string[] };
type Guide = { module: string; name: string; title: string; questions: Question[] };
type Result = { key: string; title: string; path: string; section: string; score: number; why: string[]; good_for: string; glyph: string; color: string };

export function HandbookGuide() {
  const list = useLoad(() => api.get<Guide[]>("/handbook/guide"), [], { live: false });
  const guides = list.data ?? [];
  const [mod, setMod] = useState("");
  const g = guides.find((x) => x.module === mod) ?? guides[0];
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Result[]>([]);
  useEffect(() => setAnswers({}), [g?.module]);
  useEffect(() => {
    if (!g) return;
    if (!Object.values(answers).some((a) => a.length)) return setResults([]);
    const t = setTimeout(() => api.post<{ results: Result[] }>(`/handbook/guide/${g.module}`, { answers }).then((r) => setResults(r.results)).catch(() => setResults([])), 80);
    return () => clearTimeout(t);
  }, [g?.module, JSON.stringify(answers)]);

  if (list.loading) return <div className="card chapter grid gap-3"><Sk w="40%" h={22} /><Sk h={180} /></div>;
  if (!g) return <div className="card"><Empty icon="spark" title="No guides yet">Add a guide.yaml to a module folder to get a question flow here.</Empty></div>;

  const pick = (q: Question, o: string) => {
    const cur = answers[q.id] ?? [];
    const next = q.multi ? (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]) : cur[0] === o ? [] : [o];
    setAnswers({ ...answers, [q.id]: next });
  };
  const done = g.questions.filter((q) => (answers[q.id] ?? []).length).length;
  const top = results[0]?.score ?? 1;

  return (
    <div className="guide-mode">
      <section className="card chapter grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-label-2 uppercase tracking-wide">Guide me</div>
            <h1 className="text-[24px] font-bold tracking-tight">{g.title}</h1>
          </div>
          {guides.length > 1 && (
            <div className="seg" role="tablist" aria-label="Project type">
              {guides.map((x) => <button key={x.module} role="tab" aria-selected={x.module === g.module} className={x.module === g.module ? "on" : ""} onClick={() => setMod(x.module)}>{x.name}</button>)}
            </div>
          )}
        </div>
        <div className="guide-progress" aria-hidden="true"><i style={{ transform: `scaleX(${done / g.questions.length})` }} /></div>
        {g.questions.map((q, i) => (
          <fieldset key={q.id} className="guide-q">
            <legend><span className="n">{i + 1}</span>{q.q}{q.multi && <span className="text-xs text-label-2 font-normal ml-2">Pick any</span>}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const on = (answers[q.id] ?? []).includes(o);
                return <button key={o} className={`fchip ${on ? "on" : ""}`} role={q.multi ? "checkbox" : "radio"} aria-checked={on} onClick={() => pick(q, o)}>{on && <Icon name="check" className="!w-3.5 !h-3.5" />}{o}</button>;
              })}
            </div>
          </fieldset>
        ))}
        {done > 0 && <button className="btn btn-ghost justify-self-start" onClick={() => setAnswers({})}><Icon name="refresh" />Start over</button>}
      </section>
      <aside className="card guide-results" aria-live="polite" aria-label="Chapters to read">
        <h3>Read these first</h3>
        {results.length === 0 ? (
          <p className="text-[13px] text-label-2 leading-relaxed">Answer a question and the chapters that fit show up here, best first. Nothing is sent anywhere: it's plain matching.</p>
        ) : (
          <ol>
            {results.map((r) => (
              <li key={r.key}>
                <a href={`#handbook/${r.path}`} className="guide-hit">
                  <span className="g" style={{ background: r.color || "#64748B" }}>{r.glyph || r.title.slice(0, 2).toUpperCase()}</span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-[13.5px] truncate">{r.title}</b>
                    <span className="block text-[11.5px] text-label-2 truncate">Because: {r.why.join(" · ")}</span>
                    <span className="score" aria-hidden="true"><i style={{ transform: `scaleX(${r.score / top})` }} /></span>
                  </span>
                  <Icon name="chev" className="text-label-3" />
                </a>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
