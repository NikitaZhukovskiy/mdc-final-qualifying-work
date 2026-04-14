export type FurnaceState = "on" | "off" | "batch";

const BASE_TEMP = 900;
const DROP1 = 35;
const DROP2 = 60;
const DROP1_MS = 5 * 60 * 1000;
const HOLD1_MS = 45 * 60 * 1000;
const DROP2_MS = 7 * 60 * 1000;
const HOLD2_MS = 60 * 60 * 1000;

const CYCLE_MS = DROP1_MS + HOLD1_MS + DROP2_MS + HOLD2_MS;

function phaseOffsetMs(furnaceId: number): number {
  const step = 11 * 60 * 1000;
  return (furnaceId % 3) * step;
}

function cyclePos(nowMs: number, furnaceId: number): number {
  const t = (nowMs + phaseOffsetMs(furnaceId)) % CYCLE_MS;
  return t < 0 ? t + CYCLE_MS : t;
}

export function furnaceTemperatureAt(nowMs: number, furnaceId: number): number {
  const pos = cyclePos(nowMs, furnaceId);
  let temp = BASE_TEMP;
  if (pos < DROP1_MS) {
    temp = BASE_TEMP - (DROP1 * pos) / DROP1_MS;
  } else if (pos < DROP1_MS + HOLD1_MS) {
    temp = BASE_TEMP;
  } else if (pos < DROP1_MS + HOLD1_MS + DROP2_MS) {
    const p = pos - DROP1_MS - HOLD1_MS;
    temp = BASE_TEMP - (DROP2 * p) / DROP2_MS;
  } else {
    temp = BASE_TEMP;
  }
  return Math.round(temp);
}

export function buildFurnaceTempSeries(
  furnaceId: number,
  startUtcMs: number,
  endUtcMs: number,
  stepMs = 2 * 60 * 1000,
): Array<{ utcMs: number; temp: number }> {
  if (endUtcMs <= startUtcMs) return [];
  const out: Array<{ utcMs: number; temp: number }> = [];
  for (let t = startUtcMs; t <= endUtcMs; t += stepMs) {
    out.push({ utcMs: t, temp: furnaceTemperatureAt(t, furnaceId) });
  }
  if (out[out.length - 1]?.utcMs !== endUtcMs) {
    out.push({ utcMs: endUtcMs, temp: furnaceTemperatureAt(endUtcMs, furnaceId) });
  }
  return out;
}

export function formatTempStatusLabel(state: FurnaceState): string {
  if (state === "batch") return "Запущена садка";
  if (state === "on") return "Включен";
  return "Выключен";
}

export function furnaceStateAt(nowMs: number, furnaceId: number, hasActiveBatch: boolean): FurnaceState {
  if (hasActiveBatch) return "batch";
  const temp = furnaceTemperatureAt(nowMs, furnaceId);
  if (temp <= 850) return "off";
  return "on";
}
