import { useEffect, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { go } from "../lib/router";
import type { Project } from "../lib/types";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { Menu } from "../components/Menu";
import { Banner, Empty, PageHead, Sk } from "../components/ui";
import { useToast } from "../components/Toast";
import type { PageProps } from "./registry";

type ChapterSummary = { path: string; key: string; title: string; section: string; category: string; price_rm: number[] | null; good_for: string; watch_out: string };
type Toc = { parts: { id: string; title: string; sections: { id: string; title: string; chapters: ChapterSummary[] }[] }[]; errors: { file: string; message: string }[]; count: number };
export type Chapter = ChapterSummary & { part: string; meta: Record<string, any>; body: string; file: string; editable: boolean; used_in: { id: number; name: string }[]; related: ChapterSummary[] };

/** "Add to project": session 7 replaces this for parts (qty + status in the cart). */
export const ADD_TO_PROJECT: { fn: (ch: Chapter, project: Project) => Promise<string> } = {
  fn: async (ch, project) => {
    if (project.stack.includes(ch.key)) return `${ch.title} is already in ${project.name}.`;
    await api.patch(`/projects/${project.id}`, { stack: [...project.stack, ch.key] });
    return `${ch.title} added to ${project.name}.`;
  },
};

const price = (p: number[] | null | undefined) => (p && p.length ? (p[0] === p[1] || p.length === 1 ? `RM${p[0]}` : `RM${p[0]}–${p[1]}`) : null);

export function Handbook({ params }: PageProps) {
  const toc = useLoad(() => api.get<Toc>("/handbook"));
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ ref: string; title: string }[] | null>(null);
  const [newNote, setNewNote] = useState(false);
  const firstPath = toc.data?.parts.find((p) => p.id !== "notes")?.sections[0]?.chapters[0]?.path;
  const path = params.length ? params.join("/") : firstPath;

  useEffect(() => {
    if (!q.trim()) return setHits(null);
    const t = setTimeout(() => api.get<{ results: { ref: string; title: string }[] }>(`/search?kind=handbook&limit=12&q=${encodeURIComponent(q)}`).then((r) => setHits(r.results)), 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHead eyebrow="Parts, boards and stacks" title="Handbook">
        <button className="btn" onClick={() => setNewNote(true)}><Icon name="plus" />New note</button>
      </PageHead>
      {toc.data?.errors.map((e) => (
        <div key={e.file} className="mb-4"><Banner action={<button className="btn btn-sm" onClick={toc.reload}><Icon name="refresh" />Reload</button>}>{e.message}</Banner></div>
      ))}
      <div className="hb">
        <nav className="card toc rise no-print" aria-label="Chapters">
          <input className="input !h-8 text-[13px] mb-2" placeholder="Search handbook" aria-label="Search handbook" value={q} onChange={(e) => setQ(e.target.value)} />
          {toc.loading && <div className="grid gap-2 p-2"><Sk /><Sk /><Sk /></div>}
          {hits ? (
            hits.length ? hits.map((h) => <a key={h.ref} href={`#handbook/${h.ref}`} className={h.ref === path ? "on" : ""}>{h.title}</a>) : <p className="text-xs text-label-2 p-2">No chapters match.</p>
          ) : (
            toc.data?.parts.map((part) => (
              <div key={part.id} className="toc-part">
                <h4>{part.title}</h4>
                {part.sections.map((s) => (
                  <div key={s.id}>
                    {part.sections.length > 1 && <div className="toc-sec">{s.title}</div>}
                    {s.chapters.map((c) => (
                      <a key={c.path} href={`#handbook/${c.path}`} className={c.path === path ? "on" : ""} aria-current={c.path === path ? "page" : undefined}>{c.title}</a>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </nav>
        {newNote ? <NoteEditor onDone={(p) => { setNewNote(false); toc.reload(); if (p) go(`#handbook/${p}`); }} /> : path ? <ChapterView path={path} onChanged={toc.reload} /> : !toc.loading && <div className="card"><Empty icon="book" title="No chapters yet">Add markdown files to modules/&lt;type&gt;/handbook/ or write a note.</Empty></div>}
      </div>
    </>
  );
}

function ChapterView({ path, onChanged }: { path: string; onChanged: () => void }) {
  const toast = useToast();
  const ch = useLoad(() => api.get<Chapter>(`/handbook/chapter/${path}`), [path]);
  const projects = useLoad(() => api.get<Project[]>("/projects"), [], { live: false });
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [path]);
  const c = ch.data;
  if (ch.loading) return <div className="card chapter grid gap-3"><Sk w="30%" /><Sk w="60%" h={26} /><Sk h={200} /></div>;
  if (!c) return <div className="card"><Empty icon="book" title="Chapter not found">{ch.error}</Empty></div>;
  if (editing) return <NoteEditor chapter={c} onDone={(p) => { setEditing(false); onChanged(); ch.reload(); if (p === null) go("#handbook"); }} />;

  const m = c.meta;
  const matching = (projects.data ?? []).filter((p) => c.part === "notes" || p.module === c.part);
  const add = async (p: Project) => {
    try { toast(await ADD_TO_PROJECT.fn(c, p)); notifyChanged(); ch.reload(); } catch (e) { toast((e as Error).message, "bad"); }
  };
  const specs: [string, string][] = [
    ...Object.entries((m.specs as Record<string, string>) ?? {}),
    ...(m.power?.voltage && m.power.voltage !== "-" ? [["Supply", `${m.power.voltage}${m.power.current_ma ? ` · ${m.power.current_ma} mA` : ""}`] as [string, string]] : []),
    ...(m.stall_ma ? [["Stall current", `${(m.stall_ma / 1000).toFixed(1)} A`] as [string, string]] : []),
    ...(m.max_current_ma ? [["Max current", `${(m.max_current_ma / 1000).toFixed(1)} A per channel`] as [string, string]] : []),
    ...(m.i2c_address ? [["I2C address", String(m.i2c_address)] as [string, string]] : []),
    ...(m.library && m.library !== "none" ? [["Library", String(m.library)] as [string, string]] : []),
    ...(price(m.price_rm) ? [["Price", price(m.price_rm)!] as [string, string]] : []),
  ];

  return (
    <article className="card chapter rise">
      <div className="ch-grid">
        <div className="min-w-0">
          <div className="crumb">{c.part === "notes" ? "My notes" : c.section.replace(/^\w/, (x) => x.toUpperCase())}{c.category && <><Icon name="chev" />{c.category}</>}</div>
          <h1 className="mb-2">{c.title}</h1>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {m.kind && <span className="chip">{m.kind}</span>}
            {m.category && <span className="chip">{m.category}</span>}
            {m.only && <span className="chip chip-app">{m.only} only</span>}
            {price(m.price_rm) && <span className="chip chip-ok">{price(m.price_rm)}</span>}
          </div>
          {m.watch_out && c.part !== "notes" && <div className="callout"><Icon name="alert" /><span>{m.warn || m.watch_out}</span></div>}
          <div className="flex flex-wrap gap-2 mb-4 no-print">
            {c.part !== "notes" && (
              matching.length ? (
                <AddMenu projects={matching} onPick={add} />
              ) : (
                <a className="btn btn-tinted" href="#new"><Icon name="plus" />Start a project with it</a>
              )
            )}
            {c.editable && <button className="btn btn-tinted" onClick={() => setEditing(true)}><Icon name="journal" />Edit note</button>}
            <button className="btn btn-ghost" onClick={() => window.print()}><Icon name="download" />Export PDF</button>
          </div>
          <Markdown text={c.body.replace(/^# .*\n+/, "")} className="max-w-none" />
          {Array.isArray(m.pins) && m.pins.length > 0 && (
            <>
              <h2 className="mt-6 mb-2">Pins</h2>
              <table className="tbl"><thead><tr><th>Pin</th><th>Mode</th><th>Voltage</th></tr></thead><tbody>
                {m.pins.map((p: any) => <tr key={p.name}><td className="font-mono">{p.name}</td><td>{p.mode}</td><td>{p.voltage ? <span className={`chip ${p.voltage === "5V" ? "chip-warn" : ""}`}>{p.voltage}</span> : "—"}</td></tr>)}
              </tbody></table>
            </>
          )}
          {Array.isArray(m.packages) && m.packages.length > 0 && (
            <p className="mt-4 text-[13px]"><b>Packages:</b> {m.packages.map((x: string) => <code key={x} className="font-mono text-[12.5px] bg-fill px-1.5 py-0.5 rounded mr-1">{x}</code>)}</p>
          )}
          {Array.isArray(m.env) && m.env.length > 0 && <p className="mt-2 text-[13px]"><b>Env:</b> {m.env.join(", ")} (written to .env.example)</p>}
          {m.snippet && <p className="mt-4 no-print"><a className="btn btn-sm btn-tinted" href={`#library/snippets/${m.snippet}`}><Icon name="code" />Starter snippet: {m.snippet}</a></p>}
        </div>
        <aside className="ch-rail no-print">
          {specs.length > 0 && (
            <div className="rbox"><h3>At a glance</h3><dl className="spec">{specs.map(([k, v]) => <div key={k} className="contents"><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
          )}
          {m.good_for && <div className="rbox"><h3>Good for</h3><p className="text-[13px] leading-relaxed">{m.good_for}</p></div>}
          <div className="rbox">
            <h3>Used in</h3>
            {c.used_in.length ? c.used_in.map((p) => <a key={p.id} className="used" href={`#project/${p.id}`}><Icon name="folder" />{p.name}</a>) : <p className="text-xs text-label-2">Not in any project yet.</p>}
          </div>
          {Array.isArray(m.docs) && m.docs.length > 0 && (
            <div className="rbox"><h3>Docs</h3>{m.docs.map((d: { title: string; url: string }) => <a key={d.url} className="doc" href={d.url} target="_blank" rel="noopener">{d.title}<Icon name="external" /></a>)}</div>
          )}
          {c.related.length > 0 && (
            <div className="rbox"><h3>Related</h3>{c.related.map((r) => <a key={r.path} className="rel" href={`#handbook/${r.path}`}><b>{r.title}</b><small>{[r.category, price(r.price_rm)].filter(Boolean).join(" · ")}</small></a>)}</div>
          )}
          <p className="text-[11.5px] text-label-3 font-mono break-all">{c.file}</p>
        </aside>
      </div>
    </article>
  );
}

function AddMenu({ projects, onPick }: { projects: Project[]; onPick: (p: Project) => void }) {
  if (projects.length === 1) return <button className="btn btn-tinted" onClick={() => onPick(projects[0])}><Icon name="plus" />Add to {projects[0].name}</button>;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[13px] font-semibold text-accent-text">Add to project</span>
      <Menu label="Choose project" icon="down" items={projects.map((p) => ({ label: p.name, icon: "folder", onSelect: () => onPick(p) }))} />
    </div>
  );
}

function NoteEditor({ chapter, onDone }: { chapter?: Chapter; onDone: (path?: string | null) => void }) {
  const toast = useToast();
  const slug = chapter?.path.split("/")[1];
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [body, setBody] = useState(chapter?.body.replace(/^# .*\n+/, "") ?? "");
  const [tags, setTags] = useState(((chapter?.meta.tags as string[]) ?? []).join(", "));
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    const payload = { title, body, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      const r = slug ? await api.put<Chapter>(`/handbook/notes/${slug}`, payload) : await api.post<Chapter>("/handbook/notes", payload);
      toast("Note saved.");
      onDone(r.path);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="card chapter grid gap-3 content-start">
      <h2>{slug ? "Edit note" : "New note"}</h2>
      <input className="input input-lg" placeholder="Title" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input font-mono text-[13px]" rows={14} placeholder="Markdown. ## headings, - lists, `code`." aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} />
      <input className="input" placeholder="Tags, comma separated" aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div className="flex gap-2">
        {slug && <button className="btn btn-ghost" onClick={async () => { if (!confirm) return setConfirm(true); await api.del(`/handbook/notes/${slug}`); toast("Note deleted."); onDone(null); }}><Icon name="trash" />{confirm ? "Click again to delete" : "Delete"}</button>}
        <span className="flex-1" />
        <button className="btn btn-ghost" onClick={() => onDone()}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim()} onClick={save}>Save note</button>
      </div>
    </div>
  );
}
