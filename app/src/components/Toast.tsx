import { createContext, useCallback, useContext, useState } from "react";
import { Icon } from "./Icon";

type Tone = "ok" | "bad";
type T = { id: number; msg: string; tone: Tone; out?: boolean };
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const show = useCallback((msg: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, msg, tone }]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, out: true } : x))), 2600);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.out ? "out" : ""}`}>
            <Icon name={t.tone === "ok" ? "check-c" : "x-c"} style={{ color: t.tone === "ok" ? "var(--green)" : "var(--red)" }} />
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
