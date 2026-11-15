import { useState } from "react";
import { api, useLoad } from "../lib/api";
import type { Project } from "../lib/types";
import { Icon } from "../components/Icon";
import { Empty, PageHead, Sk } from "../components/ui";
import { ProjectCard } from "../components/ProjectCard";
import type { ModulesResponse } from "./NewProject";

export function Projects() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const projects = useLoad(() => api.get<Project[]>(`/projects?archived=${archived}`), [archived]);
  const mods = useLoad(() => api.get<ModulesResponse>("/modules"), [], { live: false });
  const iconOf = (id: string) => mods.data?.modules.find((m) => m.id === id)?.icon ?? "folder";
  const list = (projects.data ?? []).filter((p) => (filter === "all" || p.module === filter) && p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead title="Projects">
        <a className="btn btn-primary" href="#new">
          <Icon name="plus" />
          New project
        </a>
      </PageHead>
      <div className="flex flex-wrap items-center gap-2 mb-4 rise">
        <input className="input !h-8 !w-56 text-[13px]" placeholder="Filter by name" aria-label="Filter projects by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="fchip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
        {mods.data?.modules.map((m) => (
          <button key={m.id} className="fchip" aria-pressed={filter === m.id} onClick={() => setFilter(m.id)}>{m.name}</button>
        ))}
        <button className="fchip ml-auto" aria-pressed={archived} onClick={() => setArchived((a) => !a)}>Archived</button>
      </div>
      {projects.loading ? (
        <div className="projects">{[0, 1, 2].map((i) => <div key={i} className="card p-4"><Sk h={70} /></div>)}</div>
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon="folder" title={archived ? "No archived projects" : "No projects match"} action={!archived ? <a className="btn" href="#new"><Icon name="plus" />New project</a> : undefined}>
            {archived ? "Archive a project from its page to tidy the list without deleting anything." : "Try another filter, or start a new project."}
          </Empty>
        </div>
      ) : (
        <div className="projects">{list.map((p) => <ProjectCard key={p.id} p={p} icon={iconOf(p.module)} />)}</div>
      )}
    </>
  );
}
