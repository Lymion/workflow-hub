import { api, useLoad } from "../lib/api";
import { Icon } from "./Icon";

export type Spend = { month: string; spent_rm: number; cap_rm: number; left_rm: number; level: "ok" | "warn" | "high" | "capped"; model: string; features: { feature: string; calls: number; rm: number; cached: number; blocked: number }[]; cache_hits: number };

const LABEL: Record<string, string> = { docs_guide: "Docs answers", commit_message: "Commit messages", parts_suggestion: "Parts suggestions", weekly_review: "Weekly review" };
const COLOR: Record<string, string> = { docs_guide: "#0A84FF", commit_message: "#30D158", parts_suggestion: "#FF9F0A", weekly_review: "#BF5AF2" };
const rm = (n: number) => `RM${n.toFixed(2)}`;

export const useSpend = () => useLoad(() => api.get<Spend>("/llm/spend"));

/** Sidebar meter, segmented by feature; hover or focus shows the breakdown. */
export function SpendMeter() {
  const { data } = useSpend();
  if (!data) return null;
  const month = new Date(data.month + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" });
  const segs = data.features.filter((f) => f.rm > 0);
  const Meter = ({ h = 6 }: { h?: number }) => (
    <div className="meter" style={{ height: h }}>
      {segs.map((f) => <i key={f.feature} style={{ width: `${(f.rm / data.cap_rm) * 100}%`, background: COLOR[f.feature] ?? "#8E8E95" }} />)}
    </div>
  );
  return (
    <div className="mini-spend" tabIndex={0} aria-describedby="spend-pop">
      <div className="flex justify-between text-xs"><span className="text-label-2">Haiku · {month}</span><b className={`num ${data.level === "ok" ? "" : "text-warn-text"}`}>{rm(data.spent_rm)} / {data.cap_rm}</b></div>
      <div className="mt-2"><Meter /></div>
      <div className="spend-pop" id="spend-pop" role="tooltip">
        <div className="flex items-center justify-between mb-2"><h3>Haiku spend</h3><span className="chip">{month}</span></div>
        <div className="text-[28px] font-bold tracking-tight num leading-none">{rm(data.spent_rm)} <small className="text-[13px] font-semibold text-label-2">of RM{data.cap_rm}</small></div>
        <div className="my-3"><Meter h={8} /></div>
        <div className="text-xs text-label-2">{rm(data.left_rm)} left · resets on the 1st · warns at RM7</div>
        <dl className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 mt-3.5 text-[13px]">
          {(data.features.length ? data.features : [{ feature: "docs_guide", calls: 0, rm: 0, cached: 0, blocked: 0 }]).map((f) => (
            <div key={f.feature} className="contents">
              <dt className="flex items-center gap-2"><i className="dot" style={{ background: COLOR[f.feature] ?? "#8E8E95" }} />{LABEL[f.feature] ?? f.feature}</dt>
              <dd className="text-right text-label-2 num">{f.calls}</dd>
              <dd className="text-right font-semibold num">{rm(f.rm)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 pt-2.5 border-t border-sep text-xs text-label-2 flex items-center gap-2"><Icon name="check-c" style={{ color: "var(--green)" }} />Cache answered {data.cache_hits} question{data.cache_hits === 1 ? "" : "s"} for free.</div>
      </div>
    </div>
  );
}

/** Home banner at RM7 (70%) and RM9 (90%), per the spec. */
export function SpendWarning() {
  const { data } = useSpend();
  if (!data || data.level === "ok") return null;
  const text = data.level === "capped" ? `Haiku cap reached (RM${data.spent_rm.toFixed(2)} of RM${data.cap_rm}). Docs search, error log and commit templates still work; calls resume on the 1st.`
    : data.level === "high" ? `Haiku spend is at RM${data.spent_rm.toFixed(2)} of RM${data.cap_rm}. Calls stop at the cap; ask fewer docs questions or rely on cached answers.`
    : `Haiku spend passed 70% (RM${data.spent_rm.toFixed(2)} of RM${data.cap_rm}) this month.`;
  return <div className={`banner ${data.level === "warn" ? "banner-warn" : "banner-bad"} mb-4`} role="status"><Icon name="alert" /><span className="flex-1">{text}</span></div>;
}
