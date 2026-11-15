import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { go } from "../../lib/router";
import type { Launcher, Project } from "../../lib/types";
import { Icon, ModuleTile } from "../../components/Icon";
import { Menu } from "../../components/Menu";
import { Banner, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { ModulesResponse } from "../NewProject";
import { tabsFor } from "./tabs";
import { DocsBar, type ProjectDocs } from "../../components/DocsList";

/** Collapsible docs for this project's board, parts and stack. Refreshes when parts change. */
function ProjectDocsBar({ id }: { id: number }) {
  const docs = useLoad(() => api.get<ProjectDocs>(`/projects/${id}/docs`), [id]);
  return (
    <div className="mb-4 rise" style={{ ["--d" as string]: "30ms" }}>
      <DocsBar data={docs.data} footer={<a className="btn btn-ghost btn-sm mt-2" href={`#docs/project/${id}`}><Icon name="search" />Ask the official docs about this project</a>} />
    </div>
  );
}


export function ProjectPage({ id, tab }: { id: number; tab?: string }) {
  const toast = useToast();
  const proj = useLoad(() => api.get<Project>(`/projects/${id}`), [id]);
  const mods = useLoad(() => api.get<ModulesResponse>("/modules"), [], { live: false });
  const boards = useLoad(() => api.get<{ board: string; name: string }[]>("/boards"), [], { live: false });
  const launchers = useLoad(() => api.get<Launcher[]>(`/projects/${id}/launchers`), [id], { live: false });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const p = proj.data;
  const mod = mods.data?.modules.find((m) => m.id === p?.module);
  const tabs = tabsFor(mod?.project_tabs ?? []);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // sliding pill under the active tab (transform only)
  const segRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = segRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${active.id}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [active.id, tabs.length]);
  useEffect(() => setConfirmRemove(false), [id]);

  const launch = async (target: string) => {
    try {
      const r = await api.post<{ message: string }>(`/projects/${id}/launch`, { target });
      toast(r.message);
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const archive = async () => {
    await api.patch(`/projects/${id}`, { archived: !p!.archived });
    toast(p!.archived ? `${p!.name} is back in your projects.` : `${p!.name} archived. Find it under Projects → Archived.`);
    notifyChanged();
    proj.reload();
  };
  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      toast("Press Remove again to confirm. Files on disk stay untouched.");
      return;
    }
    await api.del(`/projects/${id}`);
    toast(`${p!.name} removed from the hub. Its folder is still on disk.`);
    notifyChanged();
    go("#projects");
  };

  if (proj.loading)
    return (
      <div className="grid gap-4">
        <div className="flex gap-4 items-center"><Sk w={48} h={48} r={13} /><Sk w={240} h={26} /></div>
        <Sk h={200} r={16} />
      </div>
    );
  if (proj.error || !p)
    return (
      <div className="card">
        <Empty icon="folder" title="Project not found" action={<a className="btn" href="#projects">All projects</a>}>{proj.error}</Empty>
      </div>
    );

  const primary = launchers.data?.[0];
  const rest = (launchers.data ?? []).slice(1);

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 mb-5 rise">
        <ModuleTile module={{ id: p.module, icon: mod?.icon ?? "folder" }} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="truncate">{p.name}</h1>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className={`chip ${p.module === "robotics" ? "chip-rob" : p.module === "app-dev" ? "chip-app" : ""}`}>{mod?.name ?? p.module}</span>
            {p.board && <span className="chip">{boards.data?.find((b) => b.board === p.board)?.name ?? p.board}</span>}
            <span className="chip font-mono !font-medium" title={p.path}>{p.path.replace(/^.*[\\/](?=[^\\/]+[\\/][^\\/]+$)/, "…/")}</span>
            {p.archived && <span className="chip chip-warn">Archived</span>}
          </div>
        </div>
        <Menu
          label="More launch options"
          items={[
            ...rest.map((l) => ({ label: `Open in ${l.label}`, icon: l.id === "terminal" ? "terminal" : l.id === "claude" ? "spark" : "cpu", onSelect: () => (l.available ? launch(l.id) : toast(l.fix, "bad")) })),
            { label: p.archived ? "Unarchive" : "Archive", icon: "package", onSelect: archive },
            { label: confirmRemove ? "Click to confirm removal" : "Remove from hub", icon: "trash", onSelect: remove },
          ]}
        />
        {primary && (
          <button className="btn btn-primary" onClick={() => (primary.available ? launch(primary.id) : toast(primary.fix, "bad"))} title={primary.available ? undefined : primary.fix}>
            <Icon name="code" />
            Open in {primary.label}
          </button>
        )}
      </header>
      {launchers.data && primary && !primary.available && (
        <div className="mb-4"><Banner tone="warn">{primary.fix}</Banner></div>
      )}
      <ProjectDocsBar id={id} />
      <div className="seg mb-[18px] rise" style={{ ["--d" as string]: "40ms" }} role="tablist" aria-label="Project sections" ref={segRef}
        onKeyDown={(e) => {
          if (!/Arrow(Left|Right)/.test(e.key)) return;
          const i = tabs.findIndex((t) => t.id === active.id);
          const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          go(`#project/${id}/${n.id}`);
          setTimeout(() => segRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${n.id}"]`)?.focus());
        }}>
        <span className="pill" aria-hidden="true" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />
        {tabs.map((t) => (
          <button key={t.id} role="tab" data-tab={t.id} aria-selected={t.id === active.id} tabIndex={t.id === active.id ? 0 : -1} onClick={() => go(`#project/${id}/${t.id}`)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="rise" key={active.id}>
        <active.Component project={p} reload={proj.reload} />
      </div>
    </>
  );
}
