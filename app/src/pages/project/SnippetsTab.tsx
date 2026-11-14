import { api, useLoad } from "../../lib/api";
import { Empty, Sk, timeAgo } from "../../components/ui";
import type { TabProps } from "./tabs";

export function SnippetsTab({ project }: TabProps) {
  const { data, loading } = useLoad(() => api.get<{ slug: string; title: string | null; language: string | null; used_at: string }[]>(`/projects/${project.id}/snippets`), [project.id]);
  if (loading) return <Sk h={120} r={16} />;
  if (!data?.length)
    return (
      <div className="card">
        <Empty icon="layers" title="No snippets used yet" action={<a className="btn" href="#library">Open library</a>}>
          Snippets you insert from the library into this project show up here.
        </Empty>
      </div>
    );
  return (
    <div className="card p-1.5 max-w-[760px]">
      {data.map((s) => (
        <a key={s.slug} href={`#library/snippets/${s.slug}`} className="snip">
          <span className="lang">{s.language ?? "?"}</span>
          <span className="flex-1 min-w-0"><b className="block truncate">{s.title ?? s.slug}</b><span className="text-xs text-label-2">{s.slug}</span></span>
          <span className="text-xs text-label-2">{timeAgo(s.used_at)}</span>
        </a>
      ))}
    </div>
  );
}
