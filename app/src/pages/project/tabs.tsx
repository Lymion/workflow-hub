/** Project-page tab registry. Every project gets the common tabs; a module adds its own
 *  through module.yaml `project_tabs` (only tabs implemented here are shown). */
import type { Project } from "../../lib/types";
import { TasksTab } from "./TasksTab";
import { JournalTab } from "./JournalTab";

export type TabProps = { project: Project; reload: () => void };
export type TabDef = { id: string; label: string; Component: (p: TabProps) => JSX.Element };

export const COMMON_TABS: TabDef[] = [
  { id: "tasks", label: "Tasks", Component: TasksTab },
  { id: "journal", label: "Journal", Component: JournalTab },
];

/** Module tabs by id (filled in by later sessions). */
export const MODULE_TABS: Record<string, TabDef> = {};

/** Tabs that come after the module tabs for every project. */
export const TRAILING_TABS: TabDef[] = [];

export function tabsFor(moduleTabs: string[]): TabDef[] {
  const mod = moduleTabs.map((id) => MODULE_TABS[id]).filter(Boolean);
  return [COMMON_TABS[0], ...mod, ...COMMON_TABS.slice(1), ...TRAILING_TABS];
}
