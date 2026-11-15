/** Docs: official documentation, read online. Ask finds the right pages (free search + one small Haiku pick). */
import { useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import type { Project } from "../lib/types";
import { Icon } from "../components/Icon";
import { Banner, PageHead, Sk } from "../components/ui";
import { useToast } from "../components/Toast";
import { DocRow, type DocSite } from "../components/DocsList";
import { openDoc, openInBrowser, siteOf } from "../lib/opendoc";
import type { PageProps } from "./registry";

type Page = { title: string; url: string; site: string; site_title: string; why?: string };
type Answer = { status: string; picks: Page[]; candidates: Page[]; errors: string[]; unreachable: string[]; message: string; cost_rm?: number };

const listNames = (n: string[]) => (n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n[0] ?? "");

const MODULE_NAME: Record<string, string> = { robotics: "Robotics", "app-dev": "App development" };

export function Docs({ params }: PageProps) {
  const toast = useToast();
  const sites = useLoad(() => api.get<DocSite[]>("/docs/sites"), [], { live: false });
  const projects = useLoad(() => api.get<Project[]>("/projects"), [], { live: false });
  const [scope, setScope] = useState(params[0] === "project" && params[1] ? `p:${params[1]}` : "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Answer | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const ask = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const body = scope.startsWith("p:") ? { project_id: Number(scope.slice(2)) } : scope ? { module: scope } : {};
      setA(await api.post<Answer>("/docs/online/ask", { question: q, ...body }));
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const save = async (p: Page) => {
    try {
      const r = await api.post<{ message: string }>("/docs/library", { url: p.url, title: `${p.site_title} · ${p.title.split(" · ")[0]}`, module: sites.data?.find((s) => s.id === p.site)?.module ?? "" });
      setSaved((s) => ({ ...s, [p.url]: true }));
      toast(r.message);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const groups = Object.entries((sites.data ?? []).reduce<Record<string, DocSite[]>>((g, s) => ({ ...g, [s.module]: [...(g[s.module] ?? []), s] }), {}));
  const others = a ? a.candidates.filter((c) => !a.picks.some((p) => p.url === c.url)) : [];

  return (
    <>
      <PageHead eyebrow="Official docs, read online" title="Docs" />
      <section className="card p-4 grid grid-cols-1 gap-3 rise max-w-[880px]">
        <textarea
          className="input text-[15px]"
          rows={2}
          placeholder="How do I make a servo move smoothly on ESP32?"
          aria-label="Question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !h-9 !w-auto text-[13px]" aria-label="Search in" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">All doc sites</option>
            {groups.map(([m]) => <option key={m} value={m}>{MODULE_NAME[m] ?? m} docs</option>)}
            {projects.data?.length ? <optgroup label="For a project">{projects.data.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup> : null}
          </select>
          <span className="flex-1" />
          <span className="text-xs text-label-2">Searches the official sites live · one small Haiku pick</span>
          <button className="btn btn-primary" disabled={busy || q.trim().length < 3} onClick={ask}>{busy ? "Searching…" : "Find pages"}</button>
        </div>
      </section>

      {busy && <div className="grid gap-3 mt-5 max-w-[880px]"><Sk h={96} r={16} /><Sk h={96} r={16} /></div>}
      {a && !busy && (
        <div className="grid grid-cols-1 gap-3 mt-5 max-w-[880px] rise">
          {a.message && a.status !== "sent" && a.status !== "cached" && !(a.status === "no_matches" && a.unreachable.length) && (
            <Banner tone={a.status === "blocked" || a.status === "error" ? "bad" : "warn"} action={a.status === "no_key" ? <a className="btn btn-sm" href="#settings">Settings</a> : undefined}>
              {a.message}{a.candidates.length ? " The free matches are below." : ""}
            </Banner>
          )}
          {a.unreachable.length > 0 && (
            <Banner tone="warn">Couldn't search {listNames(a.unreachable)} right now. Check your connection; their sites still open from the cards below.</Banner>
          )}
          {a.picks.map((p, i) => (
            <article key={p.url} className="card p-4 grid gap-2 doc-pick">
              <div className="flex items-start gap-3">
                <span className="doc-ic k-official"><Icon name="globe" /></span>
                <div className="flex-1 min-w-0">
                  <span className="text-[11.5px] font-semibold text-label-2">{p.site_title} · {siteOf(p.url)}</span>
                  <button className="block text-left font-semibold text-[15px] text-accent-text hover:underline" onClick={() => openDoc(p.url, p.title)}>{p.title}</button>
                </div>
                {i === 0 && (a.status === "cached" ? <span className="chip chip-ok">From cache · free</span> : a.cost_rm ? <span className="chip num">RM{a.cost_rm.toFixed(4)}</span> : null)}
              </div>
              {p.why && <p className="text-[13.5px]">{p.why}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-tinted btn-sm" onClick={() => openDoc(p.url, p.title)}><Icon name="book" />Read</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openInBrowser(p.url)}><Icon name="external" />Browser</button>
                <button className="btn btn-ghost btn-sm" disabled={saved[p.url]} onClick={() => save(p)} title="Keep this page on your laptop so Ask docs can quote it"><Icon name={saved[p.url] ? "check" : "download"} />{saved[p.url] ? "Saved for Ask docs" : "Save for Ask docs"}</button>
              </div>
            </article>
          ))}
          {others.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 text-[12.5px] text-label-2">{a.picks.length ? "Other matches (free)" : "Matches (free search)"}</h3>
              {others.map((c) => <DocRow key={c.url} d={{ title: `${c.title} · ${c.site_title}`, url: c.url, kind: "official" }} />)}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 mt-8">
        {sites.loading && <Sk h={120} r={16} />}
        {groups.map(([m, list], gi) => (
          <section key={m} className="rise" style={{ ["--d" as string]: `${60 + gi * 40}ms` }}>
            <h2 className="mb-3">{MODULE_NAME[m] ?? m}</h2>
            <div className="site-grid">
              {list.map((s) => (
                <button key={s.id} className={`card site-card m-${m}`} onClick={() => openDoc(s.home, s.title)}>
                  <span className="site-ic"><Icon name="globe" /></span>
                  <b>{s.title}</b>
                  <span>{s.about}</span>
                  <span className="site-host">{siteOf(s.home)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="text-xs text-label-2 max-w-[640px]">
          Pages open live in a hub window, so they're always complete and current. To search a site, the hub keeps its list of page addresses for a week (never the pages themselves). Pages you save for Ask docs are listed in <a className="text-accent-text" href="#settings">Settings → Docs library</a>.
        </p>
      </div>
    </>
  );
}
