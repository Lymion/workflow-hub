import { ModuleTile } from "./Icon";
import { timeAgo } from "./ui";
import type { Project } from "../lib/types";
import { moduleColor } from "../lib/types";

/** Project card with a "needs doing" badge on its icon (red when something is overdue). */
export function ProjectCard({ p, icon }: { p: Project; icon: string }) {
  const pct = p.tasks_total ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
  const n = p.open_today;
  return (
    <a href={`#project/${p.id}`} className="card proj">
      <div className="top">
        <span className="relative">
          <ModuleTile module={{ id: p.module, icon }} />
          {n > 0 && (
            <span className={`pbadge ${p.overdue ? "late" : ""}`} role="img" aria-label={`${n} task${n > 1 ? "s" : ""} due${p.overdue ? ", overdue" : " today"}`}>
              {n}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <b className="block truncate">{p.name}</b>
          <span className="block text-xs text-label-2 truncate">{p.board || p.stack.slice(0, 2).join(" + ") || (p.module === "robotics" ? "Robotics" : p.module === "app-dev" ? "App" : p.module)}</span>
          {n > 0 && <span className={`due-line ${p.overdue ? "late" : ""}`}>{p.overdue ? "Overdue task" : `${n} due today`}</span>}
        </div>
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%`, background: moduleColor(p.module) }} />
      </div>
      <div className="foot">
        <span className="num">
          {p.tasks_done} / {p.tasks_total} tasks
        </span>
        <span>{timeAgo(p.last_opened_at || p.updated_at)}</span>
      </div>
    </a>
  );
}
