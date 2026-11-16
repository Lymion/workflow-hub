import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { EngineState } from "../App";

export type SidebarProject = { id: number; name: string; module: string; open_tasks?: number; overdue?: number };

/** Main navigation. Later sessions can add pages here (see features.tsx). */
export const NAV = [
  { href: "#home", icon: "home", label: "Home" },
  { href: "#projects", icon: "folder", label: "Projects" },
  { href: "#handbook", icon: "book", label: "Handbook" },
  { href: "#library", icon: "layers", label: "Library" },
  { href: "#guide", icon: "spark", label: "Ask docs" },
];

export function Sidebar({
  route,
  engine,
  onRetry,
  onSearch,
  recent = [],
  projectCount,
  footer,
}: {
  route: string;
  engine: EngineState;
  onRetry: () => void;
  onSearch: () => void;
  recent?: SidebarProject[];
  projectCount?: number;
  footer?: React.ReactNode;
}) {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("wh-theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);
  const current = (href: string) => (route === href.slice(1) || (href === "#projects" && route === "project") ? "page" : undefined);

  return (
    <aside className="sidebar" aria-label="Main">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <b>Workflow Hub</b>
        <button className="search-btn" onClick={onSearch} aria-label="Search or jump to (Ctrl K)" title="Search · Ctrl K">
          <Icon name="search" />
        </button>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={current(n.href)}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.href === "#projects" && projectCount ? <span className="meta">{projectCount}</span> : null}
          </a>
        ))}
      </nav>
      {recent.length > 0 && (
        <nav className="nav" aria-label="Recent projects">
          <div className="nav-label">Recent</div>
          {recent.slice(0, 4).map((p) => (
            <a key={p.id} href={`#project/${p.id}`}>
              <span className="dot" style={{ background: p.module === "robotics" ? "var(--robotics)" : p.module === "app-dev" ? "var(--appdev)" : "var(--label-3)" }} />
              <span className="truncate">{p.name}</span>
              {p.open_tasks ? (
                <span className={`cnt ${p.overdue ? "late" : ""}`} aria-label={`${p.open_tasks} open today`}>
                  {p.open_tasks}
                </span>
              ) : null}
            </a>
          ))}
        </nav>
      )}
      <div className="side-foot">
        {footer}
        <div className="engine">
          <span className={`dot`} style={{ background: engine === "ok" ? "var(--green)" : engine === "offline" ? "var(--red)" : "var(--label-3)" }} />
          <span style={{ color: engine === "offline" ? "var(--red-text)" : undefined }}>
            {engine === "ok" ? "Engine · :8765" : engine === "offline" ? "Engine offline" : "Connecting…"}
          </span>
          {engine === "offline" && (
            <button className="btn btn-ghost btn-sm" onClick={onRetry}>
              Retry
            </button>
          )}
          <a className="btn btn-ghost btn-sm ml-auto !px-2" href="#settings" aria-label="Settings" title="Settings">
            <Icon name="settings" />
          </a>
          {(() => {
            // light → dark → frosted glass → light
            const next = theme === "light" ? "dark" : theme === "dark" ? "glass" : "light";
            const name = { light: "light mode", dark: "dark mode", glass: "frosted glass" } as Record<string, string>;
            return (
              <button className="btn btn-ghost btn-sm !px-2" onClick={() => setTheme(next)} aria-label={`Switch to ${name[next]}`} title={`Theme: ${name[theme] ?? theme}. Click for ${name[next]}`}>
                <Icon name={next === "dark" ? "moon" : next === "glass" ? "glass" : "sun"} />
              </button>
            );
          })()}
        </div>
      </div>
    </aside>
  );
}
