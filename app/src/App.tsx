import { useCallback, useEffect, useState } from "react";
import { api, OFFLINE_MSG } from "./lib/api";
import { useRoute } from "./lib/router";
import { Sidebar } from "./components/Sidebar";
import { Banner } from "./components/ui";
import { Home } from "./pages/Home";
import { NewProject } from "./pages/NewProject";

export type EngineState = "checking" | "ok" | "offline";
export type Health = { status: string; version: string; db: string; modules: number; module_errors: number };

export default function App() {
  const route = useRoute();
  const [engine, setEngine] = useState<EngineState>("checking");

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
  switch (route.name) {
    case "new":
      page = <NewProject />;
      break;
    default:
      page = <Home />;
  }

  return (
    <div className="shell">
      <Sidebar route={route.name} engine={engine} onRetry={check} onSearch={() => window.dispatchEvent(new Event("hub:cmdk"))} />
      <main id="main">
        <div className="page" key={route.name}>
          {engine === "offline" && (
            <div className="mb-[18px]">
              <Banner action={<button className="btn btn-sm" onClick={check}>Retry</button>}>{OFFLINE_MSG}</Banner>
            </div>
          )}
          {page}
        </div>
      </main>
    </div>
  );
}
