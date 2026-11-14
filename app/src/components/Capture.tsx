import { useEffect, useRef, useState } from "react";
import { api, notifyChanged } from "../lib/api";
import { useToast } from "./Toast";

/** Ctrl+Shift+S anywhere: paste code + a note, it lands in the snippet inbox. */
export function Capture() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    addEventListener("keydown", onKey);
    addEventListener("hub:capture", onOpen);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("hub:capture", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 0);
  }, [open]);
  if (!open) return null;
  const save = async () => {
    if (!code.trim()) return;
    try {
      await api.post("/snippets/capture", { code, note });
      toast("Saved to the inbox. File it from Library when you have a minute.");
      setCode("");
      setNote("");
      setOpen(false);
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk p-4 grid gap-2.5" role="dialog" aria-modal="true" aria-label="Quick capture" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}>
        <div className="flex items-center gap-2"><h2 className="flex-1">Quick capture</h2><span className="text-xs text-label-2">Ctrl+Enter to save · Esc to close</span></div>
        <textarea ref={ref} className="input font-mono text-[12.5px]" rows={8} placeholder="Paste code…" aria-label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="input" placeholder="Note (optional): where it came from, what it's for" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!code.trim()} onClick={save}>Save to inbox</button>
        </div>
      </div>
    </div>
  );
}
