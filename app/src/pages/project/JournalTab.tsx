import { useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import type { JournalEntry } from "../../lib/types";
import { Icon } from "../../components/Icon";
import { Empty, Sk, timeAgo } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

export function JournalTab({ project }: TabProps) {
  const toast = useToast();
  const { data, loading, setData } = useLoad(() => api.get<JournalEntry[]>(`/projects/${project.id}/journal`), [project.id]);
  const [body, setBody] = useState("");
  const entries = data ?? [];

  const add = async () => {
    if (!body.trim()) return;
    try {
      const e = await api.post<JournalEntry>(`/projects/${project.id}/journal`, { body });
      setData([e, ...entries]);
      setBody("");
      notifyChanged();
    } catch (err) {
      toast((err as Error).message, "bad");
    }
  };

  return (
    <div className="grid gap-4 max-w-[760px]">
      <div className="card p-4 grid gap-2.5">
        <label className="lbl" htmlFor="jbody">What happened today?</label>
        <textarea
          id="jbody"
          className="input"
          rows={3}
          placeholder="Motors spin; left one is slower. Next: tune PWM."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add();
          }}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-label-2 flex-1">Ctrl+Enter to save. The weekly review reads these.</span>
          <button className="btn btn-primary btn-sm" disabled={!body.trim()} onClick={add}>Add entry</button>
        </div>
      </div>
      {loading ? (
        <Sk h={80} r={16} />
      ) : entries.length === 0 ? (
        <div className="card"><Empty icon="journal" title="No entries yet">A line a day is enough. It feeds the weekly review.</Empty></div>
      ) : (
        <ol className="grid gap-2.5">
          {entries.map((e) => (
            <li key={e.id} className="card p-4 group">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-label-2 flex-1">{timeAgo(e.created_at)} · {new Date(e.created_at.replace(" ", "T") + "Z").toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                <button className="btn btn-ghost btn-sm !px-2 opacity-60 hover:opacity-100" aria-label="Delete entry" onClick={async () => { setData(entries.filter((x) => x.id !== e.id)); await api.del(`/journal/${e.id}`); }}>
                  <Icon name="trash" />
                </button>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{e.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
