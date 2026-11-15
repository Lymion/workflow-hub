/** What the Wiring bench draws, shared by the 3D view (BenchGL) and the flat fallback (Bench3D):
 *  the board's model and pins, the board's shapes, and the project's part instances placed around it. */
import { useMemo } from "react";
import { boardPins, fallbackBoard, fallbackPart, layoutParts, type BoardModel, type PartModel, type Pt, type Shape } from "../../lib/iso";

export type BenchWire = { part: string; instance: number; partPin: string; boardPin: string | null; signalName: string; mode: string; divider: boolean };
export type BenchPin = { id: string; label: string; caps?: string[]; note?: string; strapping?: string; reserved?: string };
export type BenchBoard = { board: string; name: string; color: string; header?: { left: string[]; right: string[] }; pins: BenchPin[]; model?: BoardModel };
export type BenchPart = { key: string; qty: number; title: string; section: string; meta: { color?: string; category?: string; pins?: { name: string; mode?: string; voltage?: string }[]; model?: PartModel } };
export type Mode = "board" | "project";
export type Inst = { id: string; part: BenchPart; inst: number; model: PartModel; at: Pt };
export type BenchProps = {
  board: BenchBoard; parts: BenchPart[]; wires: BenchWire[]; color: Record<string, string>; bad: (w: BenchWire) => boolean;
  mode: Mode; setMode: (m: Mode) => void; traced: string | null; setTraced: (id: string | null) => void;
  selPart: string | null; setSelPart: (id: string | null) => void; pin: string | null; setPin: (id: string | null) => void;
  onMove: (w: BenchWire, pin: string) => void;
};

export const WIREABLE = new Set(["OUTPUT", "INPUT", "INPUT_PULLUP", "PWM", "ANALOG", "I2C"]);
export const wid = (w: BenchWire) => `${w.part}#${w.instance}#${w.partPin}`;

export const CAP: Record<string, string> = { digital: "Digital", output: "Output", input: "Input", pwm: "PWM", adc: "Analog", adc1: "ADC1", adc2: "ADC2", touch: "Touch", dac: "DAC", i2c: "I²C", spi: "SPI", uart: "UART", analog: "Analog" };
export const pinRole = (id: string) => ({ GND: "Ground. Join every ground together.", VIN: "Power in (5 V from USB, or 5–12 V here).", "5V": "5 V out.", "3V3": "3.3 V out.", EN: "Reset: pull low to restart.", RST: "Reset.", AREF: "Analog reference voltage.", IOREF: "Logic voltage reference." } as Record<string, string>)[id] ?? "Not a GPIO pin.";

export function wrap2(text: string, n: number): [string, string] {
  if (text.length <= n) return [text, ""];
  const cut = text.lastIndexOf(" ", n);
  const a = text.slice(0, cut > 0 ? cut : n), b = text.slice(a.length).trim();
  return [a, b.length > n ? `${b.slice(0, n - 1)}…` : b];
}

export function useBenchData(board: BenchBoard, parts: BenchPart[], wires: BenchWire[]) {
  const model = useMemo(() => board.model ?? fallbackBoard(board.header, board.color ?? "#1F3A5F"), [board]);
  const pins = useMemo(() => boardPins(model), [model]);
  const pinInfo = (id: string) => board.pins.find((x) => x.id === id);
  const silkName = (id: string) => (pinInfo(id) ? model.names?.[id] ?? `${model.prefix ?? ""}${id}` : id);
  const pinZ = model.size[2] + 3.2;

  // the board's own shapes in plan coordinates (its parts sit on its top), headers and pins included
  const boardShapes = useMemo<Shape[]>(() => {
    const [bw, bd, bt] = model.size;
    const out: Shape[] = [{ w: bw, d: bd, h: bt, color: model.color, top: model.top }];
    for (const sh of model.shapes ?? []) out.push({ ...sh, z: (sh.z ?? 0) + bt });
    const pitch = model.pitch ?? 2.54;
    model.rows.forEach((row) => {
      let start = -1;
      row.pins.forEach((id, i) => {
        const end = i === row.pins.length - 1;
        if (id !== "" && start < 0) start = i;
        if (start >= 0 && (id === "" || end)) {
          const last = id === "" ? i - 1 : i, n = last - start + 1;
          out.push({ x: row.x, y: row.y + ((start + last) / 2) * pitch, w: 2.5, d: n * pitch, z: bt, h: 2.6, color: "#14171d", top: "#1d2129" });
          start = -1;
        }
      });
    });
    for (const pn of pins) out.push({ x: pn.x, y: pn.y, w: 0.9, d: 0.9, z: bt + 2.6, h: 0.7, color: "#c99a2e", top: "#f2c75c" });
    return out;
  }, [model, pins]);

  // part instances placed around the board
  const wireKey = wires.map((w) => `${wid(w)}${w.boardPin}`).join();
  const insts = useMemo<Inst[]>(() => {
    const rowOf = new Map(pins.map((x) => [x.id, x.row]));
    const items = parts.filter((pt) => pt.section !== "boards").flatMap((pt) => {
      const wireable = (pt.meta.pins ?? []).filter((x) => WIREABLE.has((x.mode ?? "").toUpperCase())).map((x) => x.name);
      if (!pt.meta.model && !(pt.meta.pins ?? []).length) return [];
      const m = pt.meta.model ?? fallbackPart(pt.meta.color ?? "#475569", wireable);
      return Array.from({ length: pt.qty }, (_, i) => ({ pt, inst: i + 1, m }));
    });
    const sized = items.map(({ pt, inst, m }) => {
      const ws = wires.filter((w) => w.part === pt.key && w.instance === inst && w.boardPin);
      const left = ws.filter((w) => rowOf.get(String(w.boardPin)) === 0).length;
      const side: "left" | "right" | "back" = !ws.length ? "back" : left * 2 >= ws.length ? "left" : "right";
      const label = `${pt.title}${pt.qty > 1 ? ` #${inst}` : ""} · ${ws.length} wires`;
      return { id: `${pt.key}#${inst}`, side, shapes: m.shapes, tag: m.tag ?? 20, tagPx: label.length * 6.3 + 24, pt, inst, m };
    });
    const at = layoutParts(sized, boardShapes);
    return sized.map((x) => ({ id: x.id, part: x.pt, inst: x.inst, model: x.m, at: at[x.id] }));
  }, [parts, wireKey, boardShapes, pins]);

  return { model, pins, pinInfo, silkName, pinZ, boardShapes, insts };
}

/** WebGL available? (The 3D bench needs it; without it the flat drawing is used.) */
export function canUseWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
