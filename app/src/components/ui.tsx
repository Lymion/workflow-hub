import { Icon } from "./Icon";

export function Banner({ tone = "bad", children, action }: { tone?: "bad" | "warn"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`banner banner-${tone} rise`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={tone === "bad" ? "x-c" : "alert"} />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2.5 px-6 py-10">
      <div className="w-14 h-14 rounded-2xl grid place-items-center bg-accent-tint text-accent-text">
        <Icon name={icon} className="!w-[26px] !h-[26px]" />
      </div>
      <h2>{title}</h2>
      {children && <p className="text-label-2 max-w-[360px]">{children}</p>}
      {action}
    </div>
  );
}

export function Sk({ w = "100%", h = 14, r = 8, className = "" }: { w?: number | string; h?: number; r?: number; className?: string }) {
  return <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r }} />;
}

export function Check({ level, children }: { level: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div className={`chk chk-${level}`}>
      <Icon name={level === "ok" ? "check-c" : level === "warn" ? "alert" : "x-c"} />
      <span>{children}</span>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-4 mb-6 rise">
      <div className="flex-1 min-w-0">
        {eyebrow && <div className="text-[13px] text-label-2 font-medium mb-1">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}

export const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";

export const rm = (n: number) => `RM${n.toFixed(n % 1 ? 2 : 0)}`;

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const t = new Date(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return "Last week+";
}
