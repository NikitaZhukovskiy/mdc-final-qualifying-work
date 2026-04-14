import type { MachineState } from "./realtime/cycle";

export const CHART_COLOR_KEYS: Record<MachineState, string> = {
  up: "mdc-chart-color-up",
  on: "mdc-chart-color-on",
  off: "mdc-chart-color-off",
  tech_idle: "mdc-chart-color-tech",
  equip_idle: "mdc-chart-color-equip",
  lunch: "mdc-chart-color-lunch",
  service: "mdc-chart-color-service",
  accident: "mdc-chart-color-accident",
};

export const CHART_WIDTH_KEY = "mdc-chart-stroke-width";

/** Исходные цвета полос + авария (оранжевый), обслуживание (жёлтый). */
const DEFAULT_COLORS: Record<MachineState, string> = {
  up: "#8ebf4b",
  on: "#c7a980",
  off: "#fff8ee",
  tech_idle: "#e4945f",
  equip_idle: "#e04a3a",
  lunch: "#7f9db8",
  service: "#facc15",
  accident: "#f97316",
};

/** Встроенная палитра (без ввода hex вручную). */
export const CHART_PALETTE: string[] = [
  "#8ebf4b",
  "#c7a980",
  "#fff8ee",
  "#e4945f",
  "#e04a3a",
  "#f97316",
  "#fb923c",
  "#facc15",
  "#eab308",
  "#fde047",
  "#7f9db8",
  "#4a9eff",
  "#38bdf8",
  "#a78bfa",
  "#6b7280",
  "#1f2937",
];

function normHex(v: string): string {
  return v.trim().toLowerCase();
}

export function isAllowedChartColor(hex: string): boolean {
  const n = normHex(hex);
  return CHART_PALETTE.some((p) => p.toLowerCase() === n);
}

export function getChartColor(state: MachineState): string {
  try {
    const k = CHART_COLOR_KEYS[state];
    const v = localStorage.getItem(k);
    if (v && isAllowedChartColor(v)) return v.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_COLORS[state];
}

export function getChartStrokeWidth(): number {
  try {
    const v = localStorage.getItem(CHART_WIDTH_KEY);
    const n = Number.parseFloat(v ?? "");
    if (Number.isFinite(n) && n >= 0 && n <= 24) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

export function notifyChartPrefsChanged() {
  window.dispatchEvent(new Event("mdc-chart-prefs-changed"));
}
