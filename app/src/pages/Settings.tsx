import { useEffect, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { Icon } from "../components/Icon";
import { Check, PageHead, Sk, timeAgo } from "../components/ui";
import { useToast } from "../components/Toast";

type Settings = { rm_per_usd: number; api_key: "keychain" | "env" | "none"; model: string; cap_rm: number };
type DocSrc = { id: string; title: string; url: string; module: string; chunks: number; downloaded_at: string | null };

/** Settings sections added by later sessions. */
export const SETTINGS_SECTIONS: (() => JSX.Element)[] = [];

export function SettingsPage() {
  const toast = useToast();
  const s = useLoad(() => api.get<Settings>("/settings"));
  const docs = useLoad(() => api.get<DocSrc[]>("/docs"));
  const [key, setKey] = useState("");
  const [rate, setRate] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  useEffect(() => { if (s.data) setRate(String(s.data.rm_per_usd)); }, [s.data?.rm_per_usd]);

  const saveKey = async () => {
    try { s.setData(await api.post<Settings>("/settings/api-key", { key })); setKey(""); toast("Key saved in your OS keychain. It never goes into a project folder or the database."); }
    catch (e) { toast((e as Error).message, "bad"); }
  };
  const saveRate = async () => {
    try { s.setData(await api.put<Settings>("/settings", { rm_per_usd: Number(rate) })); toast("Exchange rate saved."); notifyChanged(); }
    catch (e) { toast((e as Error).message, "bad"); }
  };
  const download = async (source: string | null) => {
    setDownloading(source ?? "all");
    try {
      const r = await api.post<{ downloaded: { id: string; chunks: number }[]; failed: { id: string; message: string }[] }>("/docs/download", { source });
      const n = r.downloaded.reduce((t, d) => t + d.chunks, 0);
      toast(r.failed.length ? `${r.downloaded.length} downloaded, ${r.failed.length} failed. ${r.failed[0].message}` : `Downloaded ${r.downloaded.length} page${r.downloaded.length === 1 ? "" : "s"} (${n} chunks).`, r.failed.length ? "bad" : "ok");
      docs.reload();
    } finally { setDownloading(null); }
  };

  return (
    <>
      <PageHead title="Settings" />
      <div className="grid gap-4 max-w-[820px]">
        <section className="card p-5 grid gap-3">
          <h2>Claude Haiku</h2>
          {s.loading ? <Sk h={60} /> : s.data && (
            <>
              <p className="text-[13px] text-label-2">The hub only calls <b className="text-label font-mono text-[12.5px]">{s.data.model}</b>, for docs answers, commit messages, parts suggestions and the weekly review. Everything else runs as plain code. Hard cap: <b className="text-label">RM{s.data.cap_rm} a month</b>; calls that would pass it are blocked, not sent.</p>
              <Check level={s.data.api_key === "none" ? "warn" : "ok"}>
                {s.data.api_key === "keychain" ? "API key stored in your OS keychain." : s.data.api_key === "env" ? "Using ANTHROPIC_API_KEY from .env (development). Save it to the keychain below to drop the file." : "No API key yet. Haiku features are off; everything else works."}
              </Check>
              <div className="flex gap-2">
                <input className="input font-mono text-[13px]" type="password" placeholder="sk-ant-…" aria-label="Anthropic API key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
                <button className="btn btn-primary" disabled={key.length < 20} onClick={saveKey}>Save key</button>
                {s.data.api_key === "keychain" && <button className="btn btn-ghost" onClick={async () => { s.setData(await api.del<Settings>("/settings/api-key")); toast("Key removed from the keychain."); }}>Remove</button>}
              </div>
              <p className="text-xs text-label-2">Also set a monthly spend limit of about US$2.50 in the Claude Console, as a backup in case the hub's own counter has a bug.</p>
              <div className="flex items-end gap-2">
                <label className="grid gap-1.5"><span className="lbl">Ringgit per US dollar</span><input className="input !w-32 num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
                <button className="btn" disabled={!rate || Number(rate) === s.data.rm_per_usd} onClick={saveRate}>Save</button>
                <span className="text-xs text-label-2 pb-2.5">Used to turn each call's USD cost into RM. Update it now and then.</span>
              </div>
            </>
          )}
        </section>

        <section className="card p-5 grid gap-3">
          <div className="flex items-center gap-3"><h2 className="flex-1">Docs library</h2><button className="btn btn-tinted" disabled={!!downloading} onClick={() => download(null)}><Icon name="download" />{downloading === "all" ? "Downloading…" : "Download all"}</button></div>
          <p className="text-[13px] text-label-2">Pages listed in each module's <span className="font-mono">docs.yaml</span>, kept on your laptop and searched for free. Only the docs guide's final answer uses Haiku.</p>
          <div className="grid">
            {docs.data?.map((d) => (
              <div key={d.id} className="snip">
                <span className="lang">{d.module === "robotics" ? "rob" : "app"}</span>
                <span className="flex-1 min-w-0"><b className="block truncate">{d.title}</b><span className="text-xs text-label-2 truncate block">{d.chunks ? `${d.chunks} chunks · ${timeAgo(d.downloaded_at?.replace("T", " "))}` : "Not downloaded"}</span></span>
                <button className="btn btn-ghost btn-sm" disabled={!!downloading} onClick={() => download(d.id)}>{downloading === d.id ? "…" : d.chunks ? "Refresh" : "Download"}</button>
              </div>
            ))}
          </div>
        </section>
        {SETTINGS_SECTIONS.map((S, i) => <S key={i} />)}
      </div>
    </>
  );
}
