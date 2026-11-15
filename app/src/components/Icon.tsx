/** One stroke icon set (Lucide-style, 24px grid, 1.8 stroke). */
const P: Record<string, string> = {
  home: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10",
  folder: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  layers: "M12 2 2 7l10 5 10-5z|m2 17 10 5 10-5|m2 12 10 5 10-5",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z|m21 21-4.3-4.3",
  plus: "M5 12h14|M12 5v14",
  cpu: "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M9 9h6v6H9z|M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2",
  smartphone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01",
  check: "M20 6 9 17l-5-5",
  "check-c": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|m9 12 2 2 4-4",
  alert: "m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z|M12 9v4M12 17h.01",
  "x-c": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|m15 9-6 6M9 9l6 6",
  x: "M18 6 6 18|M6 6l12 12",
  chev: "m9 18 6-6-6-6",
  left: "m15 18-6-6 6-6",
  down: "m6 9 6 6 6-6",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  more: "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  refresh: "M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16|M8 16H3v5",
  bag: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z|M3 6h18M16 10a4 4 0 0 1-8 0",
  spark: "M12 3l1.9 5.8L20 10.5l-6.1 1.7L12 18l-1.9-5.8L4 10.5l6.1-1.7z",
  terminal: "m4 17 6-6-6-6M12 19h8",
  package: "M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z|M3.3 7 12 12l8.7-5M12 22V12",
  git: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M6 9v6M18 12a6 6 0 0 1-6 6H9",
  copy: "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  bug: "M8 2l1.9 1.9M16 2l-1.9 1.9|M9 7.1V6a3 3 0 1 1 6 0v1.1|M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z|M12 20v-9M6.5 13H3M21 13h-3.5M6 9a4 4 0 0 1-3-3.9M18 9a4 4 0 0 0 3-3.9M6 17a4 4 0 0 0-3 3.9M18 17a4 4 0 0 1 3 3.9",
  play: "m6 3 14 9-14 9z",
  stop: "M6 6h12v12H6z",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  journal: "M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z|M8 9h8M8 13h6",
  trash: "M3 6h18|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|m7 10 5 5 5-5|M12 15V3",
  external: "M15 3h6v6|M10 14 21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  "rot-l": "M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5",
  "rot-r": "M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5",
  minus: "M5 12h14",
  fit: "M4 9V4h5|M20 15v5h-5|M4 4l6 6|M20 20l-6-6",
  max: "M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7",
  min: "M4 14h6v6|M20 10h-6V4|M14 10l7-7|M3 21l7-7",
  tag: "M3 5h18v10H8l-5 4z",
  pulse: "M2 12h4l3-7 6 14 3-7h4",
  schem: "M3 7h6v10H3z|M9 10h5l2-3h5|M9 14h5l2 3h5",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15 15 0 0 1 0 20|M12 2a15 15 0 0 0 0 20",
};

export function Icon({ name, className = "", style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const d = P[name] ?? P.spark;
  return (
    <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {d.split("|").map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

/** Module icon tile: colour comes from the module's id (robotics orange, app-dev indigo, others neutral). */
export function ModuleTile({ module, size = "" }: { module: { id: string; icon: string }; size?: "" | "sm" | "lg" }) {
  const bg =
    module.id === "robotics"
      ? "linear-gradient(160deg,#FFA94D,#F56300)"
      : module.id === "app-dev"
        ? "linear-gradient(160deg,#9A98FF,#5E5CE6)"
        : "linear-gradient(160deg,#9CA3AF,#4B5563)";
  return (
    <span className={`tile ${size ? "tile-" + size : ""}`} style={{ background: bg }}>
      <Icon name={module.icon} />
    </span>
  );
}
