import { useEffect, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { go } from "../lib/router";
import { copyText, LANGS, type Snippet, type SnippetRow } from "../lib/snippets";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { Empty, PageHead, Sk } from "../components/ui";
import { useToast } from "../components/Toast";
import type { PageProps } from "./registry";

/** Library sections. Session 4 adds the error log here. */
export const LIBRARY_SECTIONS: { id: string; label: string; Component: (p: { params: string[] }) => JSX.Element }[] = [];

export function Library({ params }: PageProps) {
  const sections = [{ id: "snippets", label: "Snippets", Component: Snippets }, ...LIBRARY_SECTIONS];
  const active = sections.find((s) => s.id === params[0]) ?? sections[0];
  return (
    <>
      <PageHead title="Library">
        <button className="btn" onClick={() => window.dispatchEvent(new Event("hub:capture"))} title="Ctrl+Shift+S">
          <Icon name="download" />
          Quick capture
        </button>
      </PageHead>
      {sections.length > 1 && (
        <div className="seg mb-4" role="tablist">
          {sections.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === active.id} className={s.id === active.id ? "on" : ""} onClick={() => go(`#library/${s.id}`)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <active.Component params={params.slice(1)} />
    </>
  );
}

function Snippets({ params }: { params: string[] }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  tags.forEach((t) => qs.append("tag", t));
  const list = useLoad(() => api.get<SnippetRow[]>(`/snippets?${qs}`), [q, tags.join(",")]);
  const tagList = useLoad(() => api.get<{ tag: string; count: number }[]>("/snippets/tags"));
  const selSlug = params.length === 2 ? `${params[0]}/${params[1]}` : list.data?.find((s) => !s.inbox)?.slug;
  const sel = useLoad(() => (selSlug ? api.get<Snippet>(`/snippets/${selSlug}`) : Promise.resolve(null)), [selSlug]);
  const rows = list.data ?? [];
  const inbox = rows.filter((r) => r.inbox);
  const filed = rows.filter((r) => !r.inbox);

  return (
    <div className="lib">
      <div className="grid gap-3 content-start">
        <input className="input" placeholder="Search snippets by words" aria-label="Search snippets" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {(tagList.data ?? []).slice(0, 14).map((t) => (
            <button key={t.tag} className="fchip !h-6 !px-2.5 !text-[12px]" aria-pressed={tags.includes(t.tag)} onClick={() => setTags(tags.includes(t.tag) ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}>
              {t.tag} <span className="opacity-60 num">{t.count}</span>
            </button>
          ))}
        </div>
        {list.loading ? (
          <div className="card p-3 grid gap-2"><Sk /><Sk /><Sk /></div>
        ) : (
          <>
            {inbox.length > 0 && (
              <div className="card p-1.5">
                <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold text-warn-text">Inbox · file these</div>
                {inbox.map((s) => <SnipRow key={s.slug} s={s} active={s.slug === selSlug} />)}
              </div>
            )}
            <div className="card p-1.5">
              {filed.length === 0 ? (
                <p className="text-label-2 p-3">No snippets match. Clear the filters, or save a new one.</p>
              ) : (
                filed.map((s) => <SnipRow key={s.slug} s={s} active={s.slug === selSlug} />)
              )}
            </div>
            <button className="btn btn-tinted" onClick={() => setAdding(true)}><Icon name="plus" />New snippet</button>
          </>
        )}
      </div>
      <div className="min-w-0">
        {adding ? (
          <NewSnippet onDone={(slug) => { setAdding(false); if (slug) go(`#library/snippets/${slug}`); }} />
        ) : sel.loading && selSlug ? (
          <div className="card p-6 grid gap-3"><Sk w="40%" h={22} /><Sk h={160} /></div>
        ) : !sel.data ? (
          <div className="card"><Empty icon="layers" title="Pick a snippet">Search by words or tap tags. Ctrl+Shift+S captures code from anywhere.</Empty></div>
        ) : (
          <SnippetDetail s={sel.data} onChanged={() => { list.reload(); tagList.reload(); }} toast={toast} />
        )}
      </div>
    </div>
  );
}

function SnipRow({ s, active }: { s: SnippetRow; active: boolean }) {
  return (
    <a href={`#library/snippets/${s.slug}`} className={`snip ${active ? "on" : ""}`}>
      <span className="lang">{s.language}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{s.title}</b>
        <span className="block truncate text-xs text-label-2">{s.category} · {s.tags.slice(0, 3).join(", ")}</span>
      </span>
    </a>
  );
}

function SnippetDetail({ s, onChanged, toast }: { s: Snippet; onChanged: () => void; toast: (m: string, t?: "ok" | "bad") => void }) {
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState(s.title);
  const [tags, setTags] = useState(s.tags.filter((t) => t !== "inbox").join(", "));
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setTitle(s.title); setTags(s.tags.filter((t) => t !== "inbox").join(", ")); setConfirm(false); }, [s.slug, s.title, s.tags]);
  const lines = s.code.split("\n");
  const changeLines = new Set(s.change_points.map((c) => c.line));
  const fileIt = async () => {
    if (!category.trim()) return toast("Pick a category to file it under, like sensors or ui.", "bad");
    const r = await api.post<Snippet>(`/snippets/${s.slug}/file`, { category, title, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
    toast(`Filed under ${r.category}.`);
    go(`#library/snippets/${r.slug}`);
    onChanged();
    notifyChanged();
  };
  const del = async () => {
    if (!confirm) { setConfirm(true); return; }
    await api.del(`/snippets/${s.slug}`);
    toast("Snippet deleted.");
    go("#library/snippets");
    onChanged();
  };
  return (
    <article className="card p-6 grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-label-2 mb-1 font-mono">snippets/{s.slug}</div>
          <h1 className="!text-[22px]">{s.title}</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="chip">{s.language}</span>
            {s.tags.map((t) => <span key={t} className={`chip ${t === "inbox" ? "chip-warn" : ""}`}>{t}</span>)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={async () => toast((await copyText(s.code)) ? "Code copied. Paste it at your cursor in VS Code." : "Couldn't reach the clipboard. Select the code and copy it.", "ok")}>
          <Icon name="copy" />Copy code
        </button>
      </div>
      {s.inbox && (
        <div className="rbox grid gap-2.5">
          <b className="text-[13px]">File this capture</b>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 max-md:grid-cols-1">
            <input className="input !h-9" placeholder="Category (e.g. sensors)" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input className="input !h-9" placeholder="Title" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="input !h-9" placeholder="Tags, comma separated" aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            <button className="btn btn-tinted" onClick={fileIt}>File it</button>
          </div>
        </div>
      )}
      {s.change_points.length > 0 && (
        <div className="text-[12.5px] text-label-2">
          <b className="text-label">Change before use:</b> {s.change_points.map((c) => `line ${c.line} (${c.text})`).join(" · ")}
        </div>
      )}
      <div className="code-card">
        <div className="code-head"><Icon name="code" className="text-label-2" /><b className="flex-1 font-mono text-[12.5px]">{s.files[0] ?? "snippet"}</b></div>
        <pre className="code">
          {lines.map((l, i) => (
            <span key={i} className={`ln ${changeLines.has(i + 1) ? "chg" : ""}`}>
              <span className="no">{i + 1}</span>
              {l || " "}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
      {s.readme && <Markdown text={s.readme.replace(/^# .*\n/, "")} />}
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={del}><Icon name="trash" />{confirm ? "Click again to delete" : "Delete snippet"}</button>
      </div>
    </article>
  );
}

function NewSnippet({ onDone }: { onDone: (slug?: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", category: "", language: "cpp", tags: "", code: "", readme: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const s = await api.post<Snippet>("/snippets", { ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) });
      toast(`Saved to snippets/${s.slug}.`);
      notifyChanged();
      onDone(s.slug);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="card p-6 grid gap-3">
      <h2>Save to library</h2>
      <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
        <input className="input" placeholder="Title" aria-label="Title" value={f.title} onChange={set("title")} />
        <input className="input" placeholder="Category (sensors, ui…)" aria-label="Category" value={f.category} onChange={set("category")} />
        <select className="input" aria-label="Language" value={f.language} onChange={set("language")}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
      </div>
      <input className="input" placeholder="Tags, comma separated" aria-label="Tags" value={f.tags} onChange={set("tags")} />
      <textarea className="input font-mono text-[12.5px]" rows={10} placeholder="Code. Mark lines to edit with // CHANGE: what to change" aria-label="Code" value={f.code} onChange={set("code")} />
      <textarea className="input" rows={3} placeholder="README: what it does, dependencies" aria-label="README" value={f.readme} onChange={set("readme")} />
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={() => onDone()}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.title.trim() || !f.category.trim() || !f.code.trim()} onClick={save}>Save</button>
      </div>
    </div>
  );
}
