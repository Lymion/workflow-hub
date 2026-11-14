export type Project = {
  id: number;
  name: string;
  slug: string;
  module: string;
  path: string;
  board: string | null;
  stack: string[];
  archived: boolean;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  tasks_total: number;
  tasks_done: number;
  open_today: number;
  overdue: number;
};

export type Task = {
  id: number;
  project_id: number;
  title: string;
  status: "todo" | "doing" | "done";
  due: string | null;
  position: number;
  source: string | null;
  created_at: string;
  done_at: string | null;
  project_name?: string;
  project_module?: string;
};

export type JournalEntry = { id: number; project_id: number; body: string; created_at: string };
export type Launcher = { id: string; label: string; available: boolean; fix: string };

export const moduleColor = (id: string) => (id === "robotics" ? "var(--robotics)" : id === "app-dev" ? "var(--appdev)" : "var(--label-3)");

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function dueLabel(due: string | null, status: string): { text: string; cls: string } {
  if (status === "done") return { text: "Done", cls: "done" };
  if (!due) return { text: "", cls: "" };
  const t = todayISO();
  if (due === t) return { text: "Today", cls: "today" };
  const d = new Date(due + "T00:00:00");
  const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (due < t) return { text: `Overdue · ${d.toLocaleDateString(undefined, { weekday: "short" })}`, cls: "late" };
  return { text: label, cls: "" };
}
