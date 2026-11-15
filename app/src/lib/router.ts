/** Hash routes: #home, #new, #project/12/tasks, #handbook/robotics/hc-sr04 ... */
import { useEffect, useState } from "react";

export function useRoute() {
  const [hash, setHash] = useState(location.hash || "#home");
  useEffect(() => {
    const f = () => setHash(location.hash || "#home");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const [name, ...params] = hash.slice(1).split("/").map(decodeURIComponent);
  return { name: name || "home", params, hash };
}

export const go = (hash: string) => {
  location.hash = hash;
};

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
