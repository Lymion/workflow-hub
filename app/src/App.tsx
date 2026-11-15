import { useCallback, useEffect, useState } from "react";
import { api, OFFLINE_MSG, useLoad } from "./lib/api";
import { useRoute } from "./lib/router";
import type { Project } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { CommandBar } from "./components/CommandBar";
import { Capture } from "./components/Capture";
import { Banner } from "./components/ui";
import { UpdateBanner } from "./components/UpdateBanner";
import { Home } from "./pages/Home";
import { NewProject } from "./pages/NewProject";
import { Projects } from "./pages/Projects";
import { ProjectPage } from "./pages/project/ProjectPage";
import { PAGES, SIDEBAR_FOOTERS } from "./pages/registry";

export type EngineState = "checking" | "ok" | "offline";
export type Health = { status: string; version: string; db: string; modules: number; module_errors: number };

export default function App() {
  const route = useRoute();
  const [engine, setEngine] = useState<EngineState>("checking");
  const projects = useLoad(() => api.get<Project[]>("/projects"));

  const check = useCallback(async () => {
    setEngine("checking");
    try {
      await api.get<Health>("/health");
      setEngine("ok");
      window.dispatchEvent(new Event("hub:changed"));
    } catch {
      setEngine("offline");
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);

  let page: React.ReactNode;
  const Extra = PAGES[route.name];
  switch (route.name) {
    case "new":
      page = <NewProject />;
      break;
    case "projects":
      page = <Projects />;
      break;
    case "project":
      page = <ProjectPage id={Number(route.params[0])} tab={route.params[1]} />;
      break;
    default:
      page = Extra ? <Extra params={route.params} /> : <Home />;
  }

  const list = projects.data ?? [];
  return (
    <div className="shell">
      <Sidebar
        route={route.name}
        engine={engine}
        onRetry={check}
        onSearch={() => window.dispatchEvent(new Event("hub:cmdk"))}
        recent={list.map((p) => ({ id: p.id, name: p.name, module: p.module, open_tasks: p.open_today, overdue: p.overdue }))}
        projectCount={list.length}
        footer={SIDEBAR_FOOTERS.map((F, i) => <F key={i} />)}
      />
      <main id="main">
        <div className="page" key={route.name + (route.params[0] ?? "")}>
          <UpdateBanner />
          {engine === "offline" && (
            <div className="mb-[18px]">
              <Banner action={<button className="btn btn-sm" onClick={check}>Retry</button>}>{OFFLINE_MSG}</Banner>
            </div>
          )}
          {page}
        </div>
      </main>
      <CommandBar projects={list} />
      <Capture />
    </div>
  );
}
