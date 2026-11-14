/** Tiny client for the local engine on 127.0.0.1:8765. */
import { useCallback, useEffect, useRef, useState } from "react";

export const ENGINE: string = (import.meta.env.VITE_ENGINE_URL as string | undefined) ?? "http://127.0.0.1:8765";
export const OFFLINE_MSG = "Can't reach the engine on localhost:8765. Start it with python -m engine, then retry.";

export class EngineError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ENGINE + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new EngineError(OFFLINE_MSG, 0);
  }
  if (!r.ok) {
    let msg = `Engine error ${r.status}`;
    try {
      const j = await r.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* not JSON */
    }
    throw new EngineError(msg, r.status);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const api = {
  get: <T,>(p: string) => req<T>("GET", p),
  post: <T,>(p: string, b?: unknown) => req<T>("POST", p, b ?? {}),
  patch: <T,>(p: string, b: unknown) => req<T>("PATCH", p, b),
  put: <T,>(p: string, b: unknown) => req<T>("PUT", p, b),
  del: <T,>(p: string) => req<T>("DELETE", p),
};

/** Tell every screen that hub data changed (sidebar counts, home, etc. reload). */
export const notifyChanged = () => window.dispatchEvent(new Event("hub:changed"));

/** Load data on mount (and on hub:changed); returns {data, error, loading, reload}. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { live?: boolean } = { live: true }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    reload();
    if (!opts.live) return;
    const f = () => reload();
    window.addEventListener("hub:changed", f);
    return () => window.removeEventListener("hub:changed", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}
