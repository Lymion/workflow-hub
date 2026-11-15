/** Docs for a project's board, parts and stack: used on New project and in the project's docs bar. */
import { useState } from "react";
import { Icon } from "./Icon";
import { openDoc, openInBrowser, siteOf } from "../lib/opendoc";

export type DocLink = { title: string; url: string; kind: "handbook" | "official" | "library" };
export type ItemDocs = { key: string; title: string; section: string; docs: DocLink[] };
export type DocSite = { id: string; title: string; about: string; home: string; module: string; searchable: boolean };
export type ProjectDocs = { items: ItemDocs[]; sites: DocSite[] };

const KIND: Record<DocLink["kind"], [string, string]> = {
  handbook: ["book", "Hub handbook"],
  official: ["globe", "Official docs"],
  library: ["package", "Library page"],
};

export function DocRow({ d }: { d: DocLink }) {
  const web = !d.url.startsWith("#");
  return (
    <div className="doc-row">
      <span className={`doc-ic k-${d.kind}`} title={KIND[d.kind][1]}><Icon name={KIND[d.kind][0]} /></span>
      <button className="flex-1 min-w-0 text-left" onClick={() => openDoc(d.url, d.title)} title={web ? `Read ${siteOf(d.url)} in the hub` : "Open in the hub's handbook"}>
        <b className="block truncate text-[13px]">{d.title}</b>
        <span className="block truncate text-[11.5px] text-label-2">{web ? siteOf(d.url) : "Handbook"}</span>
      </button>
      {web && (
        <button className="btn btn-ghost btn-sm !px-2" aria-label={`Open ${d.title} in your browser`} title="Open in your browser" onClick={() => openInBrowser(d.url)}>
          <Icon name="external" />
        </button>
      )}
    </div>
  );
}

export function DocsList({ items, sites = [] }: { items: ItemDocs[]; sites?: DocSite[] }) {
  return (
    <div className="docs-grid">
      {items.map((it) => (
        <section key={it.key} className="docs-group">
          <h4>{it.title}</h4>
          {it.docs.map((d) => <DocRow key={d.url} d={d} />)}
        </section>
      ))}
      {sites.length > 0 && (
        <section className="docs-group">
          <h4>Full docs</h4>
          {sites.map((s) => <DocRow key={s.id} d={{ title: s.title, url: s.home, kind: "official" }} />)}
        </section>
      )}
    </div>
  );
}

/** A calm, collapsible bar. Shows a count until opened. */
export function DocsBar({ data, title = "Docs for this project", defaultOpen = false, footer }: { data: ProjectDocs | null; title?: string; defaultOpen?: boolean; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!data || data.items.length === 0) return null;
  const pages = data.items.reduce((n, it) => n + it.docs.length, 0);
  const names = data.items.map((it) => it.title);
  return (
    <section className={`card docs-bar ${open ? "open" : ""}`}>
      <button className="docs-bar-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tile tile-sm docs-tile"><Icon name="book" /></span>
        <span className="flex-1 min-w-0 text-left">
          <b className="block text-[14px]">{title}</b>
          <span className="block truncate text-xs text-label-2">{pages} pages for {names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ")}</span>
        </span>
        <Icon name="down" className="docs-chev" />
      </button>
      <div className="docs-bar-body" hidden={!open}>
        <DocsList items={data.items} sites={data.sites} />
        {footer}
      </div>
    </section>
  );
}
