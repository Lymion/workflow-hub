import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type MenuItem = { label: string; icon?: string; onSelect: () => void; disabled?: boolean; hint?: string };

/** Popover menu that scales from its trigger (top right). Esc and outside click close it. */
export function Menu({ items, label = "More", icon = "more" }: { items: MenuItem[]; label?: string; icon?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost !px-2.5" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
      </button>
      <div className={`menu ${open ? "open" : ""}`} role="menu">
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            disabled={it.disabled}
            title={it.hint}
            onClick={() => {
              setOpen(false);
              it.onSelect();
            }}
          >
            {it.icon && <Icon name={it.icon} />}
            <span className="flex-1 text-left">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
