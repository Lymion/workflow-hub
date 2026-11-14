import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../lib/router";
import type { Project } from "../lib/types";
import { moduleColor } from "../lib/types";
import { Icon } from "./Icon";

export type Command = { id: string; group: string; label: string; hint?: string; icon?: string; dot?: string; run: () => void };

/** Extra command sources (snippets, chapters...) register here. Each returns commands for a query. */
export const COMMAND_SOURCES: ((q: string) => Promise<Command[]>)[] = [];

/** Ctrl+K: jump to any project, page or action. Keyboard-first, so it opens without animation. */
export function CommandBar({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [extra, setExtra] = useState<Command[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    addEventListener("keydown", onKey);
    addEventListener("hub:cmdk", onOpen);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("hub:cmdk", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !q.trim() || !COMMAND_SOURCES.length) return setExtra([]);
    let live = true;
    const t = setTimeout(async () => {
      const lists = await Promise.all(COMMAND_SOURCES.map((s) => s(q).catch(() => [] as Command[])));
      if (live) setExtra(lists.flat());
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  const base: Command[] = useMemo(
    () => [
      ...projects.map((p) => ({ id: `p${p.id}`, group: "Projects", label: p.name, hint: p.module === "robotics" ? "Robotics" : p.module === "app-dev" ? "App" : p.module, dot: moduleColor(p.module), run: () => go(`#project/${p.id}`) })),
      { id: "new", group: "Actions", label: "New project", icon: "plus", run: () => go("#new") },
      { id: "home", group: "Actions", label: "Go home", icon: "home", run: () => go("#home") },
      { id: "handbook", group: "Actions", label: "Open handbook", icon: "book", run: () => go("#handbook") },
      { id: "library", group: "Actions", label: "Open library", icon: "layers", run: () => go("#library") },
      { id: "guide", group: "Actions", label: "Ask the docs", icon: "spark", run: () => go("#guide") },
      { id: "settings", group: "Actions", label: "Settings", icon: "settings", run: () => go("#settings") },
    ],
    [projects],
  );
  const items = [...base.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())), ...extra];
  const groups = [...new Set(items.map((c) => c.group))];
  const run = (c: Command) => {
    setOpen(false);
    c.run();
  };

  if (!open) return null;
  let idx = -1;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command bar">
        <input
          ref={input}
          placeholder="Jump to a project, snippet, chapter or action…"
          aria-label="Command"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && items[sel]) run(items[sel]);
          }}
        />
        <ul>
          {items.length === 0 && <li className="grp">No matches. Try another word.</li>}
          {groups.map((g) => (
            <div key={g}>
              <li className="grp">{g}</li>
              {items
                .filter((c) => c.group === g)
                .map((c) => {
                  idx = items.indexOf(c);
                  const i = idx;
                  return (
                    <li key={c.id} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                      {c.dot ? <span className="dot mx-1" style={{ background: c.dot }} /> : <Icon name={c.icon ?? "chev"} />}
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="hint">{c.hint}</span>}
                    </li>
                  );
                })}
            </div>
          ))}
        </ul>
      </div>
    </div>
  );
}
