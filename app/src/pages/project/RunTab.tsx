/** Session 10: run panel. Builds, uploads, dev servers and the serial monitor/plotter in one place. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { go } from "../../lib/router";
import { Icon } from "../../components/Icon";
import { Check, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

type ProcInfo = { state: "starting" | "running" | "exited" | "failed" | "stopped"; code: number | null; started: number; ended: number | null; seq: number; running: boolean };
type Target = { id: string; label: string; kind: "task" | "server" | "serial"; hint: string; fix: string; baud: number | null; available: boolean; proc: ProcInfo | null };
type Line = { seq: number; t: number; text: string };
type LogRes = ProcInfo & { lines: Line[]; past_errors?: { id: number; error_text: string; cause: string; fix: string }[]; error_text?: string };
type Port = { device: string; description: string; likely: boolean };

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const STATE: Record<string, [string, string]> = { running: ["run-dot on", "Running"], starting: ["run-dot on", "Starting"], exited: ["run-dot ok", "Done"], failed: ["run-dot bad", "Failed"], stopped: ["run-dot", "Stopped"] };
const ICON: Record<Target["kind"], string> = { task: "zap", server: "play", serial: "terminal" };
const URL_RE = /\b(?:https?|exp):\/\/[^\s"'<>]+/g;

export function RunTab({ project }: TabProps) {
  const toast = useToast();
  const list = useLoad(() => api.get<{ targets: Target[] }>(`/projects/${project.id}/run`), [project.id]);
  const targets = list.data?.targets ?? [];
  const [sel, setSel] = useState<string>("");
  const t = targets.find((x) => x.id === sel) ?? targets[0];
  const anyRunning = targets.some((x) => x.proc?.running);

  // keep target statuses fresh while something runs
  useEffect(() => {
    if (!anyRunning) return;
    const h = setInterval(() => list.reload(), 1500);
    return () => clearInterval(h);
  }, [anyRunning]);

  if (list.loading) return <div className="run-grid"><Sk h={220} r={16} /><Sk h={420} r={16} /></div>;
  if (!targets.length) return <div className="card"><Empty icon="play" title="Nothing to run">This project type has no run targets yet.</Empty></div>;

  return (
    <div className="run-grid">
      <nav className="run-list card" aria-label="Run targets">
        {targets.map((x) => {
          const st = x.proc ? STATE[x.proc.state] : ["run-dot", "Idle"];
          return (
            <button key={x.id} className={`run-item ${t?.id === x.id ? "on" : ""}`} aria-current={t?.id === x.id} onClick={() => setSel(x.id)}>
              <span className="ri-ic"><Icon name={ICON[x.kind]} /></span>
              <span className="flex-1 min-w-0 text-left">
                <b className="block text-[13.5px]">{x.label}</b>
                <span className="block text-xs text-label-2 truncate">{x.available ? st[1] : "Needs setup"}</span>
              </span>
              <i className={st[0]} aria-hidden="true" />
            </button>
          );
        })}
        <p className="text-[11.5px] text-label-2 px-2 pt-2 leading-relaxed">Everything runs here, so you only need this one window. Processes stop when the hub closes.</p>
      </nav>
      {t && <Console key={t.id} project={project.id} target={t} onChange={list.reload} toast={toast} />}
    </div>
  );
}

function Console({ project, target, onChange, toast }: { project: number; target: Target; onChange: () => void; toast: ReturnType<typeof useToast> }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [info, setInfo] = useState<LogRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"log" | "plot">("log");
  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(target.baud ?? 115200);
  const ports = useLoad(() => (target.kind === "serial" ? api.get<Port[]>("/serial/ports") : Promise.resolve([] as Port[])), [target.kind], { live: false });
  const last = useRef(0);
  const wasRunning = useRef(false);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const running = info?.running ?? target.proc?.running ?? false;
  const started = !!(info || target.proc);

  useEffect(() => { if (!port && ports.data?.length) setPort(ports.data[0].device); }, [ports.data]);

  // poll the log: fast while running, once otherwise
  useEffect(() => {
    if (!started) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.get<LogRes>(`/projects/${project}/run/${target.id}/log?after=${last.current}`);
        if (!alive) return;
        if (r.lines.length) {
          last.current = r.lines[r.lines.length - 1].seq;
          setLines((prev) => [...prev, ...r.lines].slice(-3000));
        }
        if (wasRunning.current && !r.running) {
          onChange();
          if (r.state === "failed") toast(`${target.label} failed. The error is in the log.`, "bad");
          else if (r.state === "exited" && target.kind === "task") toast(`${target.label} finished.`);
        }
        wasRunning.current = r.running;
        setInfo(r);
      } catch { /* engine restarting */ }
    };
    tick();
    const h = setInterval(tick, running ? 400 : 3000);
    return () => { alive = false; clearInterval(h); };
  }, [started, running, project, target.id]);

  // stick to the bottom unless the user scrolled up
  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, view]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.post<ProcInfo>(`/projects/${project}/run/${target.id}`, target.kind === "serial" ? { port: port || null, baud } : { port: port || null });
      last.current = 0;
      setLines([]);
      setInfo({ ...r, lines: [] });
      wasRunning.current = true;
      stick.current = true;
      onChange();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.post(`/projects/${project}/run/${target.id}/stop`); onChange(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!input) return;
    try { await api.post(`/projects/${project}/run/${target.id}/send`, { text: input }); setInput(""); } catch (e) { toast((e as Error).message, "bad"); }
  };
  const saveError = async () => {
    try {
      await api.post("/errors", { error_text: info?.error_text || lines.slice(-20).map((l) => l.text).join("\n"), project_id: project });
      toast("Saved to the error log. Add the cause and fix there once you've solved it.");
      notifyChanged();
      go("#library/errors");
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  const urls = useMemo(() => {
    const found = new Set<string>();
    for (const l of lines.slice(-400)) for (const m of l.text.match(URL_RE) ?? []) if (/localhost|127\.0\.0\.1|exp:\/\//.test(m)) found.add(m.replace(/[.,)]+$/, ""));
    return [...found].slice(-2);
  }, [lines.length]);
  const elapsed = info ? Math.round(((info.ended ?? Date.now() / 1000) - info.started) * 10) / 10 : null;

  return (
    <section className="run-main card">
      <header className="run-head">
        <div className="flex-1 min-w-0">
          <h2 className="flex items-center gap-2">{target.label}{info && <span className={`chip ${info.state === "failed" ? "chip-bad" : info.running ? "chip-ok" : ""}`}>{STATE[info.state][1]}{elapsed != null && !info.running ? ` · ${elapsed}s` : ""}</span>}</h2>
          <p className="text-xs text-label-2 mt-0.5">{target.hint}</p>
        </div>
        {(target.kind === "serial" || target.id === "upload") && (
          <select className="input !h-9 !w-auto max-w-[220px]" aria-label="USB port" value={port} onChange={(e) => setPort(e.target.value)} disabled={running}>
            {(ports.data ?? []).length === 0 && <option value="">Auto-detect port</option>}
            {(ports.data ?? []).map((p) => <option key={p.device} value={p.device}>{p.device}{p.likely ? " · board" : ""}</option>)}
          </select>
        )}
        {target.kind === "serial" && (
          <select className="input !h-9 !w-auto" aria-label="Baud rate" value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={running}>
            {BAUDS.map((b) => <option key={b} value={b}>{b} baud</option>)}
          </select>
        )}
        {running ? (
          <button className="btn" disabled={busy} onClick={stop}><Icon name="stop" />Stop</button>
        ) : (
          <button className="btn btn-primary" disabled={busy || !target.available} onClick={start}><Icon name="play" />{started ? "Run again" : "Start"}</button>
        )}
      </header>
      {!target.available && <div className="px-4 pb-3"><Check level="warn"><b>{target.label}</b> can't run yet. {target.fix}</Check></div>}
      {info?.state === "failed" && (
        <div className="px-4 pb-3 grid gap-2">
          {(info.past_errors ?? []).slice(0, 1).map((e) => <Check key={e.id} level="ok"><b>You've fixed this before:</b> {e.fix || e.cause || "see the error log"}</Check>)}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-bad-text font-medium flex-1 min-w-0 truncate font-mono text-[12px]">{(info.error_text ?? "").split("\n")[0]}</span>
            <button className="btn btn-sm" onClick={saveError}><Icon name="bug" />Save to error log</button>
          </div>
        </div>
      )}
      {target.kind === "serial" && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="seg" role="tablist" aria-label="Serial view">
            <button role="tab" aria-selected={view === "log"} className={view === "log" ? "on" : ""} onClick={() => setView("log")}>Monitor</button>
            <button role="tab" aria-selected={view === "plot"} className={view === "plot" ? "on" : ""} onClick={() => setView("plot")}>Plotter</button>
          </div>
        </div>
      )}
      {urls.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {urls.map((u) => <a key={u} className="fchip" href={u.startsWith("exp") ? undefined : u} target="_blank" rel="noreferrer"><Icon name="external" />{u}</a>)}
        </div>
      )}
      {view === "plot" && target.kind === "serial" ? (
        <Plotter lines={lines} />
      ) : (
        <pre ref={box} className="console" tabIndex={0} aria-label={`${target.label} output`} aria-live="off"
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
          {lines.length === 0 ? <span className="text-[#8E8E99]">{started ? "Waiting for output…" : `Press Start to run ${target.label.toLowerCase()}. Output shows here.`}</span>
            : lines.map((l) => <span key={l.seq} className={`cl ${l.text.startsWith("[hub]") ? "hub" : l.text.startsWith("$ ") || l.text.startsWith("> ") ? "cmd" : /error|failed|exception/i.test(l.text) ? "err" : /warning/i.test(l.text) ? "warn" : /success|done/i.test(l.text) ? "ok" : ""}`}>{l.text || " "}{"\n"}</span>)}
        </pre>
      )}
      {target.kind !== "task" && (
        <div className="run-send">
          <input className="input flex-1 font-mono !text-[13px]" placeholder={target.kind === "serial" ? "Send to the board… (Enter)" : "Send a key, e.g. r to reload (Enter)"} value={input}
            disabled={!running} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Send input" />
          <button className="btn" disabled={!running || !input} onClick={send}>Send</button>
        </div>
      )}
    </section>
  );
}

// ---------------- serial plotter ----------------

const COLORS = ["#0A84FF", "#FF375F", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FFD60A", "#AC8E68"];
const MAX_POINTS = 300;

/** "left:120 right:98", "t=1.2,v=3.4" or "120 98" / "120,98" → series values. */
export function parseSeries(text: string): Record<string, number> | null {
  const named = [...text.matchAll(/([A-Za-z_][\w.-]*)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)/g)];
  if (named.length) return Object.fromEntries(named.map((m) => [m[1], Number(m[2])]));
  const parts = text.trim().split(/[\s,;\t]+/);
  if (parts.length && parts.length <= 8 && parts.every((p) => /^-?\d+(?:\.\d+)?$/.test(p))) return Object.fromEntries(parts.map((p, i) => [`v${i + 1}`, Number(p)]));
  return null;
}

function Plotter({ lines }: { lines: Line[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => {
    const s = new Map<string, number[]>();
    let n = 0;
    for (const l of lines.slice(-MAX_POINTS * 2)) {
      if (l.text.startsWith("> ") || l.text.startsWith("[hub]")) continue; // your own input and hub notes
      const v = parseSeries(l.text);
      if (!v) continue;
      n++;
      for (const [k, x] of Object.entries(v)) {
        if (!s.has(k) && s.size >= COLORS.length) continue;
        const arr = s.get(k) ?? [];
        while (arr.length < n - 1) arr.push(NaN);
        arr.push(x);
        s.set(k, arr);
      }
    }
    for (const arr of s.values()) arr.splice(0, Math.max(0, arr.length - MAX_POINTS));
    return [...s];
  }, [lines.length]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const all = series.flatMap(([, a]) => a.filter((x) => !Number.isNaN(x)));
    if (!all.length) return;
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const y = (v: number) => h - 20 - ((v - lo) / (hi - lo)) * (h - 36);
    g.strokeStyle = "rgba(255,255,255,.07)"; g.fillStyle = "#8E8E99"; g.font = "11px ui-monospace, monospace"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4, yy = y(v);
      g.beginPath(); g.moveTo(44, yy); g.lineTo(w - 8, yy); g.stroke();
      g.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), 4, yy + 4);
    }
    series.forEach(([, arr], i) => {
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = 1.75; g.lineJoin = "round"; g.beginPath();
      let pen = false;
      arr.forEach((v, j) => {
        if (Number.isNaN(v)) { pen = false; return; }
        const x = 44 + (j / Math.max(1, MAX_POINTS - 1)) * (w - 52);
        pen ? g.lineTo(x, y(v)) : g.moveTo(x, y(v));
        pen = true;
      });
      g.stroke();
    });
  }, [series]);

  return (
    <div className="plot">
      {series.length === 0 ? (
        <p className="text-[13px] text-[#8E8E99] p-4 leading-relaxed">No numbers yet. Print lines like <code className="text-white">left:120 right:98</code> or <code className="text-white">120,98</code> from the board and they draw here.</p>
      ) : (
        <div className="plot-legend">
          {series.map(([k, a], i) => <span key={k}><i style={{ background: COLORS[i % COLORS.length] }} />{k} <b className="num">{a[a.length - 1]}</b></span>)}
        </div>
      )}
      <canvas ref={canvas} aria-label="Serial plot" />
    </div>
  );
}
