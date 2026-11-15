/** Small burst of coloured sparks from an element: transform + opacity only, removed when done. */
import { calm } from "./router";

const SPARK = ["#30D158", "#0A84FF", "#FF9F0A", "#FF375F", "#BF5AF2", "#FFD60A"];

export function burst(el: Element, n = 10, dist = 30) {
  if (calm()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.className = "spark" + (i % 2 ? " bar" : "");
    s.style.background = SPARK[i % SPARK.length];
    s.style.left = cx - 3 + "px";
    s.style.top = cy - 3 + "px";
    document.body.append(s);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = dist * (0.7 + Math.random() * 0.6);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const rot = Math.random() * 240 - 120;
    s.animate(
      [
        { transform: "translate(0,0) scale(.6) rotate(0deg)", opacity: 1 },
        { transform: `translate(${x}px,${y}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x * 1.15}px,${y * 1.15 + 8}px) scale(.4) rotate(${rot * 1.4}deg)`, opacity: 0 },
      ],
      { duration: 560 + Math.random() * 120, easing: "cubic-bezier(.23,1,.32,1)" },
    ).onfinish = () => s.remove();
  }
}

/** Check pop + row flash when a task is completed. */
export function celebrateTask(check: HTMLElement, row: HTMLElement) {
  if (calm()) return;
  check.animate([{ transform: "scale(.82)" }, { transform: "scale(1.14)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" });
  row.animate([{ backgroundColor: "var(--green-tint)" }, { backgroundColor: "transparent" }], { duration: 700, easing: "ease-out" });
  burst(check);
}
