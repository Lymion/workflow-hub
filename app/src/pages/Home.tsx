import { useRef, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { celebrateTask, burst } from "../lib/celebrate";
import type { Project, Task } from "../lib/types";
import { dueLabel, moduleColor } from "../lib/types";
import { Icon } from "../components/Icon";
import { Empty, PageHead, Sk } from "../components/ui";
import { ProjectCard } from "../components/ProjectCard";
import { useToast } from "../components/Toast";
import type { ModulesResponse } from "./NewProject";
import { SpendWarning } from "../components/SpendMeter";

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

export function TaskRow({ t, onToggle, showProject = true }: { t: Task; onToggle: (t: Task, check: HTMLElement, row: HTMLElement) => void; showProject?: boolean }) {
  const rowRef = useRef<HTMLLIElement>(null);
  const due = dueLabel(t.due, t.status);
  const done = t.status === "done";
  return (
    <li ref={rowRef} className={`task ${done ? "done" : ""}`}>
      <button className="check" aria-label={done ? "Mark not done" : "Mark done"} onClick={(e) => onToggle(t, e.currentTarget, rowRef.current!)}>
        <svg viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
      <div className="t">
        <b>{t.title}</b>
        {showProject && t.project_name && (
          <a href={`#project/${t.project_id}`} className="sub">
            <i className="dot" style={{ background: moduleColor(t.project_module || "") }} />
            {t.project_name}
          </a>
        )}
      </div>
      <span className={`due ${due.cls}`}>{due.text}</span>
    </li>
  );
}

export function Home() {
  const toast = useToast();
  const tasks = useLoad(() => api.get<Task[]>("/tasks/today"));
  const projects = useLoad(() => api.get<Project[]>("/projects"));
  const mods = useLoad(() => api.get<ModulesResponse>("/modules"), [], { live: false });
  const [filter, setFilter] = useState("all");
  const allDoneRef = useRef<HTMLSpanElement>(null);
  const iconOf = (id: string) => mods.data?.modules.find((m) => m.id === id)?.icon ?? "folder";

  const list = tasks.data ?? [];
  const done = list.filter((t) => t.status === "done").length;
  const recent = (projects.data ?? []).slice(0, 5).filter((p) => filter === "all" || p.module === filter);

  const toggle = async (t: Task, check: HTMLElement, row: HTMLElement) => {
    const next = t.status === "done" ? "todo" : "done";
    tasks.setData(list.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    if (next === "done") {
      celebrateTask(check, row);
      if (done + 1 === list.length) setTimeout(() => allDoneRef.current && burst(allDoneRef.current, 18, 56), 140);
    }
    try {
      await api.patch(`/tasks/${t.id}`, { status: next });
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
      tasks.reload();
    }
  };

  const noProjects = !projects.loading && !projects.error && (projects.data ?? []).length === 0;

  return (
    <>
      <PageHead eyebrow={today()} title="Today">
        <a className="btn btn-primary btn-glow" href="#new">
          <Icon name="plus" />
          New project
        </a>
      </PageHead>

      <SpendWarning />
      {noProjects ? (
        <div className="card rise">
          <Empty icon="folder" title="Start your first project" action={<a className="btn btn-primary" href="#new"><Icon name="plus" />New project</a>}>
            Pick a project type. The hub sets up the folder, files and git in under five minutes.
          </Empty>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rise" style={{ ["--d" as string]: "40ms" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <h2 className="flex-1">Today's tasks</h2>
              {list.length > 0 && (
                <span className="text-xs text-label-2 num">
                  {done} of {list.length} done
                </span>
              )}
            </div>
            {list.length > 0 && (
              <div className="today-bar" role="progressbar" aria-label="Today's progress" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={done}>
                <i style={{ transform: `scaleX(${list.length ? done / list.length : 0})` }} />
              </div>
            )}
            {list.length > 0 && done === list.length && (
              <div className="all-done">
                <span className="badge" ref={allDoneRef}>
                  <Icon name="check" />
                </span>
                <span>
                  All {list.length} done for today. Nice work.
                  <small>Everything due today is ticked off.</small>
                </span>
              </div>
            )}
            {tasks.loading ? (
              <div className="card p-5 grid gap-4">
                <Sk w="62%" />
                <Sk w="48%" />
                <Sk w="70%" />
              </div>
            ) : list.length === 0 ? (
              <div className="card px-5 py-4 text-label-2">Nothing due today. Tasks with today's date, or overdue ones, show up here.</div>
            ) : (
              <ul className="card tasks">
                {list.map((t) => (
                  <TaskRow key={t.id} t={t} onToggle={toggle} />
                ))}
              </ul>
            )}
          </section>

          <section className="rise" style={{ ["--d" as string]: "90ms" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <h2 className="flex-1">Recent projects</h2>
              <div className="flex gap-1.5" role="group" aria-label="Filter by type">
                <button className="fchip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                  All
                </button>
                {mods.data?.modules.map((m) => (
                  <button key={m.id} className="fchip" aria-pressed={filter === m.id} onClick={() => setFilter(m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            {projects.loading ? (
              <div className="projects">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card p-4 grid gap-3">
                    <Sk w={36} h={36} r={10} />
                    <Sk w="70%" h={12} />
                    <Sk h={4} />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="card px-5 py-4 text-label-2">No {mods.data?.modules.find((m) => m.id === filter)?.name ?? ""} projects yet.</div>
            ) : (
              <div className="projects">
                {recent.map((p) => (
                  <ProjectCard key={p.id} p={p} icon={iconOf(p.module)} />
                ))}
              </div>
            )}
          </section>
          {HOME_SECTIONS.map((S, i) => <S key={i} />)}
        </div>
      )}
    </>
  );
}

/** Extra Home sections registered by later sessions (e.g. the weekly review). */
export const HOME_SECTIONS: (() => JSX.Element | null)[] = [];
