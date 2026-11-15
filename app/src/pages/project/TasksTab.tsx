import { useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import type { Task } from "../../lib/types";
import { dueLabel } from "../../lib/types";
import { celebrateTask } from "../../lib/celebrate";
import { Icon } from "../../components/Icon";
import { Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

const COLS: { id: Task["status"]; title: string }[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
];

export function TasksTab({ project }: TabProps) {
  const toast = useToast();
  const { data, loading, setData, reload } = useLoad(() => api.get<Task[]>(`/projects/${project.id}/tasks`), [project.id]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showAllDone, setShowAllDone] = useState(false);
  const tasks = data ?? [];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const t = await api.post<Task>(`/projects/${project.id}/tasks`, { title, due: due || null });
      setData([...tasks, t]);
      setTitle("");
      setDue("");
      notifyChanged();
    } catch (err) {
      toast((err as Error).message, "bad");
    }
  };
  const move = async (t: Task, status: Task["status"], el?: HTMLElement) => {
    setData(tasks.map((x) => (x.id === t.id ? { ...x, status } : x)));
    if (status === "done" && el) celebrateTask(el, el.closest(".kcard") as HTMLElement);
    try {
      await api.patch(`/tasks/${t.id}`, { status });
      notifyChanged();
    } catch (err) {
      toast((err as Error).message, "bad");
      reload();
    }
  };
  const remove = async (t: Task) => {
    setData(tasks.filter((x) => x.id !== t.id));
    await api.del(`/tasks/${t.id}`).catch(() => reload());
    notifyChanged();
  };

  if (loading)
    return (
      <div className="board">
        {COLS.map((c) => (
          <div key={c.id} className="card col p-3 grid gap-2">
            <Sk w="40%" />
            <Sk h={54} />
          </div>
        ))}
      </div>
    );

  return (
    <>
      <form className="add-task card" onSubmit={add}>
        <Icon name="plus" className="text-label-2" />
        <input className="flex-1 bg-transparent border-0 outline-none text-[14px]" placeholder="Add a task, then press Enter" aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className="input !h-8 !w-[150px] text-[13px]" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn btn-sm btn-tinted" disabled={!title.trim()}>Add</button>
      </form>
      {tasks.length === 0 ? (
        <div className="card mt-4">
          <Empty icon="check-c" title="No tasks yet">
            Add the first one above. The setup checklist lands here after the wizard runs.
          </Empty>
        </div>
      ) : (
        <div className="board mt-4">
          {COLS.map((c) => {
            let col = tasks.filter((t) => t.status === c.id);
            const hidden = c.id === "done" && !showAllDone ? Math.max(0, col.length - 5) : 0;
            if (hidden) col = col.slice(-5);
            return (
              <div key={c.id} className="card col">
                <div className="col-head">
                  <h3 className="flex-1">{c.title}</h3>
                  <span className="count num">{tasks.filter((t) => t.status === c.id).length}</span>
                </div>
                {col.map((t) => {
                  const d = dueLabel(t.due, t.status);
                  const i = COLS.findIndex((x) => x.id === t.status);
                  return (
                    <div key={t.id} className={`kcard ${t.status === "done" ? "done" : ""}`}>
                      <div className="flex items-start gap-2">
                        <button className={`check sm ${t.status === "done" ? "on" : ""}`} aria-label={t.status === "done" ? "Mark not done" : "Mark done"} onClick={(e) => move(t, t.status === "done" ? "todo" : "done", e.currentTarget)}>
                          <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                        </button>
                        <b className="flex-1">{t.title}</b>
                      </div>
                      <div className="r">
                        {d.text && <span className={`due ${d.cls}`}>{d.text}</span>}
                        {t.source && <span>· {t.source}</span>}
                        <span className="acts">
                          {i > 0 && <button aria-label={`Move to ${COLS[i - 1].title}`} onClick={() => move(t, COLS[i - 1].id)}><Icon name="left" /></button>}
                          {i < 2 && <button aria-label={`Move to ${COLS[i + 1].title}`} onClick={(e) => move(t, COLS[i + 1].id, COLS[i + 1].id === "done" ? (e.currentTarget.closest(".kcard")!.querySelector(".check") as HTMLElement) : undefined)}><Icon name="chev" /></button>}
                          <button aria-label="Delete task" onClick={() => remove(t)}><Icon name="trash" /></button>
                        </span>
                      </div>
                    </div>
                  );
                })}
                {hidden > 0 && (
                  <button className="btn btn-ghost btn-sm w-full" onClick={() => setShowAllDone(true)}>
                    Show {hidden} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
