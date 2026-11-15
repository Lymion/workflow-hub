import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calm } from "../lib/router";

export type TileItem = { id: string; name: string; sub: string; glyph: string; color: string; good?: string; watch?: string; price?: string; disabled?: string; badge?: string };

/** Tooltip shared by every tile grid: first one waits 350 ms, neighbours open instantly. */
let lastHide = 0;
function Tip({ item, anchor }: { item: TileItem; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; ox: number } | null>(null);
  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 290;
    const h = ref.current?.offsetHeight ?? 120;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    let y = r.top - h - 10;
    const below = y < 8;
    if (below) y = r.bottom + 10;
    setPos({ x, y, below, ox: r.left + r.width / 2 - x });
  }, [anchor]);
  return createPortal(
    <div ref={ref} role="tooltip" className={`tip ${pos ? "on" : ""}`} style={pos ? { left: pos.x, top: pos.y, transformOrigin: `${pos.ox}px ${pos.below ? "0" : "100%"}` } : { left: -9999, top: 0 }}>
      <div className="h"><b>{item.name}</b>{item.price && <span>{item.price}</span>}</div>
      {item.good && <p><span className="k">Good for</span>{item.good}</p>}
      {item.watch && <p className="w"><span className="k">Watch out</span>{item.watch}</p>}
      {item.disabled && <p className="w"><span className="k">Unavailable</span>{item.disabled}</p>}
    </div>,
    document.body,
  );
}

export function TileGrid({ items, selected, onToggle, single, label }: { items: TileItem[]; selected: Set<string>; onToggle: (id: string) => void; single?: boolean; label: string }) {
  const [hover, setHover] = useState<{ item: TileItem; el: HTMLElement } | null>(null);
  const timer = useRef<number>();
  const show = (item: TileItem, el: HTMLElement, instant = false) => {
    clearTimeout(timer.current);
    const warm = instant || hover || Date.now() - lastHide < 500 || calm();
    if (warm) setHover({ item, el });
    else timer.current = window.setTimeout(() => setHover({ item, el }), 350);
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (hover) lastHide = Date.now();
    setHover(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="ktiles" role={single ? "radiogroup" : "group"} aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          className="kt"
          role={single ? "radio" : "checkbox"}
          aria-checked={selected.has(it.id)}
          aria-disabled={!!it.disabled}
          onClick={() => !it.disabled && onToggle(it.id)}
          onPointerEnter={(e) => e.pointerType === "mouse" && show(it, e.currentTarget)}
          onPointerLeave={hide}
          onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(it, e.currentTarget, true)}
          onBlur={hide}
        >
          <span className="g" style={{ background: it.color }}>{it.glyph}</span>
          <span className="min-w-0">
            <b className="block text-[13.5px] font-semibold">{it.name}</b>
            <span className="block text-xs text-label-2 truncate">{it.sub}</span>
            {it.badge && <span className="block mt-0.5 text-[11px] font-bold text-good-text">{it.badge}</span>}
          </span>
          <span className="ck"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg></span>
        </button>
      ))}
      {hover && <Tip item={hover.item} anchor={hover.el} />}
    </div>
  );
}
