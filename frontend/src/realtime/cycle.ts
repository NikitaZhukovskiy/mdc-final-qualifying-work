import { getCncScenarioByName } from "./cncScenarioConfig";

/** Длительность цикла сценария — 60 минут; фаза привязана к часам Москвы. */

export const CYCLE_MS = 60 * 60 * 1000;
export const MSK_TZ = "Europe/Moscow";
const MIN_PER_DAY = 24 * 60;

export type MachineState =
  | "on"
  | "up"
  | "off"
  | "tech_idle"
  | "equip_idle"
  | "lunch"
  | "service"
  | "accident";

export const STATE_LABEL: Record<MachineState, string> = {
  on: "Включен",
  up: "Работа по УП",
  off: "Выключен",
  tech_idle: "Технический простой",
  equip_idle: "Простой оборудования",
  lunch: "Обед",
  service: "Обслуживание оборудования",
  accident: "Авария",
};

type ScenarioStep = { kind: "up" | "idle"; minutes: number };

const TECH_IDLE_LIMIT_MS = 5 * 60 * 1000;

/** Участок сценария в координатах цикла [start, end). */
type RawCycleBlock =
  | { kind: "up"; start: number; end: number }
  | { kind: "idle"; start: number; end: number }
  | { kind: "state"; state: MachineState; start: number; end: number };

const MACHINE_SCENARIOS: Record<string, ScenarioStep[]> = {
  haas: [
    { kind: "up", minutes: 20 },
    { kind: "idle", minutes: 3 },
    { kind: "up", minutes: 17 },
    { kind: "idle", minutes: 6 },
    { kind: "up", minutes: 14 },
  ],
  dmg: [
    { kind: "up", minutes: 10 },
    { kind: "idle", minutes: 6 },
    { kind: "up", minutes: 20 },
    { kind: "idle", minutes: 9 },
    { kind: "up", minutes: 15 },
  ],
  doosan: [
    { kind: "up", minutes: 30 },
    { kind: "idle", minutes: 2 },
    { kind: "up", minutes: 10 },
    { kind: "idle", minutes: 8 },
    { kind: "up", minutes: 10 },
  ],
};

function scenarioKey(machineName?: string | null): keyof typeof MACHINE_SCENARIOS {
  const n = (machineName ?? "").toLowerCase();
  if (n.includes("haas")) return "haas";
  if (n.includes("dmg")) return "dmg";
  if (n.includes("doosan") || n.includes("lynx")) return "doosan";
  return "haas";
}

function buildRawBlocks(name?: string | null): RawCycleBlock[] {
  const custom = getCncScenarioByName(name ?? "");
  if (custom && custom.length > 0) {
    const out: RawCycleBlock[] = [];
    let cursor = 0;
    for (const step of custom) {
      const d = Math.max(0, Math.floor(step.minutes)) * 60 * 1000;
      if (d <= 0) continue;
      const start = cursor;
      cursor += d;
      out.push({ kind: "state", state: step.state, start, end: cursor });
      if (cursor >= CYCLE_MS) break;
    }
    if (cursor < CYCLE_MS) {
      out.push({ kind: "state", state: "up", start: cursor, end: CYCLE_MS });
    }
    return out;
  }

  const scenario = MACHINE_SCENARIOS[scenarioKey(name)];
  const out: RawCycleBlock[] = [];
  let cursor = 0;
  for (const step of scenario) {
    const stepMs = step.minutes * 60 * 1000;
    const start = cursor;
    if (step.kind === "up") {
      cursor += stepMs;
      out.push({ kind: "up", start, end: cursor });
    } else {
      cursor += stepMs;
      out.push({ kind: "idle", start, end: cursor });
    }
  }
  if (cursor < CYCLE_MS) {
    out.push({ kind: "up", start: cursor, end: CYCLE_MS });
  }
  return out;
}

/** Часы:минуты:секунды по Москве для момента nowMs (UTC). */
export function moscowClockParts(nowMs: number) {
  const d = new Date(nowMs);
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: MSK_TZ,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(d);
  const H = +p.find((x) => x.type === "hour")!.value;
  const M = +p.find((x) => x.type === "minute")!.value;
  const S = +p.find((x) => x.type === "second")!.value;
  const totalMinutes = H * 60 + M;
  return { H, M, S, totalMinutes };
}

/** Смещение внутри текущего слота московских часов [0, CYCLE_MS). */
export function moscowPositionInCycle(nowMs: number, phaseOffsetMs = 0): number {
  const { H, M, S } = moscowClockParts(nowMs);
  const sec = H * 3600 + M * 60 + S;
  let t = (sec * 1000 + (nowMs % 1000) + phaseOffsetMs) % CYCLE_MS;
  if (t < 0) t += CYCLE_MS;
  return t;
}

/** Начало текущего интервала цикла по московскому времени, в минутах от полуночи. */
export function moscowSlotStartMinutes(nowMs: number): number {
  const { totalMinutes } = moscowClockParts(nowMs);
  const cycleMinutes = Math.max(1, Math.floor(CYCLE_MS / (60 * 1000)));
  return Math.floor(totalMinutes / cycleMinutes) * cycleMinutes;
}

export function formatMoscowMinuteOfDay(minuteOfDay: number): string {
  const x = ((minuteOfDay % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(x / 60);
  const mi = x % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Время по Москве: начало 30-мин слота + смещение внутри него. */
export function formatMoscowTimeAtSlotOffset(
  slotStartMinutes: number,
  offsetMs: number,
  withSeconds: boolean,
): string {
  let msFromMidnight = slotStartMinutes * 60 * 1000 + offsetMs;
  msFromMidnight = ((msFromMidnight % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  const totalSec = Math.floor(msFromMidnight / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (withSeconds) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type AxisTick = {
  offsetMs: number;
  pct: number;
  isMajor: boolean;
  label: string | null;
};

/** Деления полной шкалы; подписи зависят от шага (5 мин / 1 мин / 1 с). */
export function buildAxisTicks(nowMs: number, tickStepMs: number): AxisTick[] {
  const slotStart = moscowSlotStartMinutes(nowMs);
  const out: AxisTick[] = [];
  let step = 0;
  while (true) {
    const offsetMs = Math.min(step * tickStepMs, CYCLE_MS);
    const pct = (offsetMs / CYCLE_MS) * 100;
    const isMajor =
      tickStepMs >= 300_000
        ? true
        : tickStepMs >= 60_000
          ? true
          : offsetMs % 60_000 === 0;

    let label: string | null = null;
    if (tickStepMs >= 60_000) {
      label = formatMoscowTimeAtSlotOffset(slotStart, offsetMs, false);
    } else {
      if (offsetMs % 30_000 === 0 || offsetMs === 0 || offsetMs === CYCLE_MS) {
        label = formatMoscowTimeAtSlotOffset(slotStart, offsetMs, true);
      }
    }

    out.push({ offsetMs, pct, isMajor, label });

    if (offsetMs >= CYCLE_MS) break;
    step += 1;
  }
  return out;
}

/** Пресеты масштаба шкалы. */
export const TICK_STEP_5MIN = 5 * 60 * 1000;
export const TICK_STEP_1MIN = 60 * 1000;
export const TICK_STEP_30MIN = 30 * 60 * 1000;

/** Длина видимого окна времени (мс) для каждого шага делений. */
export const VIEWPORT_MS_BY_STEP: Record<number, number> = {
  [TICK_STEP_30MIN]: 60 * 60 * 1000,
  [TICK_STEP_5MIN]: 30 * 60 * 1000,
  [TICK_STEP_1MIN]: 12 * 60 * 1000,
};

/** Макс. сдвиг «назад» по времени (просмотр истории). */
export const MAX_PAN_MS = 60 * 60 * 1000;
/** Старт накопления истории: 13.04.2026 00:00:00 МСК (UTC+3). */
export const HISTORY_START_UTC_MS = Date.UTC(2026, 3, 12, 21, 0, 0, 0);

const moscowWallFormatterHm = new Intl.DateTimeFormat("sv-SE", {
  timeZone: MSK_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const moscowWallFormatterHms = new Intl.DateTimeFormat("sv-SE", {
  timeZone: MSK_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatMoscowWallClock(utcMs: number, withSeconds: boolean): string {
  const d = new Date(utcMs);
  return withSeconds
    ? moscowWallFormatterHms.format(d)
    : moscowWallFormatterHm.format(d);
}

export type ViewportTick = {
  utcMs: number;
  pct: number;
  isMajor: boolean;
  label: string | null;
};

const MAX_AXIS_LINES = 180;

/** Деления и подписи для окна [windowStart, windowEnd] (UTC мс). */
export function buildViewportAxisTicks(
  windowStart: number,
  windowEnd: number,
  tickStepMs: number,
): ViewportTick[] {
  const dur = windowEnd - windowStart;
  if (dur <= 0) return [];

  let lineStep = tickStepMs;
  const approx = dur / lineStep;
  if (approx > MAX_AXIS_LINES) {
    lineStep = Math.ceil(dur / MAX_AXIS_LINES / tickStepMs) * tickStepMs;
  }

  let t = Math.floor(windowStart / lineStep) * lineStep;
  if (t < windowStart) t += lineStep;

  const out: ViewportTick[] = [];
  let idx = 0;

  for (; t <= windowEnd + 0.5; t += lineStep) {
    if (t > windowEnd) break;
    const pct = ((t - windowStart) / dur) * 100;
    const isMajor =
      lineStep >= 60_000 ? true : idx % 30 === 0 || idx === 0;

    let label: string | null = null;
    if (tickStepMs >= 300_000) {
      label = formatMoscowWallClock(t, false);
    } else if (tickStepMs >= 60_000) {
      label = formatMoscowWallClock(t, false);
    }

    out.push({ utcMs: t, pct, isMajor, label });
    idx += 1;
  }
  return out;
}

/** @deprecated используйте moscowPositionInCycle для привязки к МСК */
export function positionInCycle(nowMs: number, phaseOffsetMs = 0): number {
  const t = (nowMs + phaseOffsetMs) % CYCLE_MS;
  return t < 0 ? t + CYCLE_MS : t;
}

type StateMetaAtOffset = {
  state: MachineState;
  /** Начало текущего под-участка в цикле (для equip после 5 мин — это A+5мин, визуально полоса с effectiveStart). */
  startOffsetMs: number;
  /** Следующая граница в цикле (конец под-участка). */
  endOffsetMs: number;
  effectiveStartOffsetMs: number;
  /** Конец текущей фазы для подсказки «ещё идёт / уже закончилось». */
  phaseEndOffsetMs: number;
};

/**
 * @param posInCycle — смещение внутри 60-мин цикла
 * @param cycleStartUtc — UTC начала этого прохода цикла (cursor - pos)
 * @param asOfUtcMs — момент, от которого считаем «прошло ли 5 мин с начала простоя» (обычно сейчас now)
 */
function stateMetaAtCyclePos(
  posInCycle: number,
  cycleStartUtc: number,
  machineName?: string | null,
  asOfUtcMs?: number,
): StateMetaAtOffset | null {
  const asOf = asOfUtcMs ?? Date.now();
  const blocks = buildRawBlocks(machineName);
  for (const block of blocks) {
    if (posInCycle < block.start || posInCycle >= block.end) continue;
    if (block.kind === "state") {
      return {
        state: block.state,
        startOffsetMs: block.start,
        endOffsetMs: block.end,
        effectiveStartOffsetMs: block.start,
        phaseEndOffsetMs: block.end,
      };
    }
    if (block.kind === "up") {
      return {
        state: "up",
        startOffsetMs: block.start,
        endOffsetMs: block.end,
        effectiveStartOffsetMs: block.start,
        phaseEndOffsetMs: block.end,
      };
    }
    const A = block.start;
    const B = block.end;
    const D = B - A;
    const idleStartUtc = cycleStartUtc + A;
    if (D <= TECH_IDLE_LIMIT_MS) {
      return {
        state: "tech_idle",
        startOffsetMs: A,
        endOffsetMs: B,
        effectiveStartOffsetMs: A,
        phaseEndOffsetMs: B,
      };
    }
    const split = A + TECH_IDLE_LIMIT_MS;
    const elapsed = asOf - idleStartUtc;

    if (elapsed < TECH_IDLE_LIMIT_MS) {
      if (posInCycle < split) {
        return {
          state: "tech_idle",
          startOffsetMs: A,
          endOffsetMs: split,
          effectiveStartOffsetMs: A,
          phaseEndOffsetMs: split,
        };
      }
      return {
        state: "equip_idle",
        startOffsetMs: split,
        endOffsetMs: B,
        effectiveStartOffsetMs: A,
        phaseEndOffsetMs: B,
      };
    }

    return {
      state: "equip_idle",
      startOffsetMs: A,
      endOffsetMs: B,
      effectiveStartOffsetMs: A,
      phaseEndOffsetMs: B,
    };
  }
  return null;
}

/** Состояние сценария в момент utcMs (московские часы → фаза цикла). */
export function machineStateAtUtc(utcMs: number, machineName?: string | null): MachineState {
  const pos = moscowPositionInCycle(utcMs, 0);
  const cycleStartUtc = utcMs - pos;
  return stateMetaAtCyclePos(pos, cycleStartUtc, machineName, utcMs)?.state ?? "up";
}

/**
 * Прогресс по текущему участку «работа по УП» в цикле (0…100%).
 * При досрочном завершении УП снаружи можно подставить своё отношение
 * «фактическое время / плановая длительность УП» — здесь только полный проход участка.
 */
export function cncUpProgramProgressAtUtc(
  nowMs: number,
  machineName?: string | null,
): {
  inUp: boolean;
  progressPct: number;
  elapsedMs: number;
  segmentDurationMs: number;
} {
  const pos = moscowPositionInCycle(nowMs, 0);
  const blocks = buildRawBlocks(machineName);
  for (const b of blocks) {
    if (b.kind !== "up") continue;
    if (pos >= b.start && pos < b.end) {
      const d = b.end - b.start;
      const elapsed = pos - b.start;
      const progressPct = d > 0 ? Math.min(100, (elapsed / d) * 100) : 0;
      return { inUp: true, progressPct, elapsedMs: elapsed, segmentDurationMs: d };
    }
  }
  return { inUp: false, progressPct: 0, elapsedMs: 0, segmentDurationMs: 0 };
}

export type StateSegmentUtc = {
  state: MachineState;
  startUtc: number;
  /** Конец сегмента в окне (может совпадать с правым краем окна). */
  endUtc: number;
  effectiveStartUtc: number;
  /** Фактическое окончание фазы сценария по UTC (без обрезки окном) — для подсказок «идёт / завершён». */
  logicalEndUtc: number;
};

/** Непрерывные участки состояния на интервале (слева — раньше, справа — позже). */
export function buildStateSegmentsForWindow(
  windowStart: number,
  windowEnd: number,
  machineName?: string | null,
  /** «Сейчас» по часам: от него считается, прошло ли 5 мин с начала простоя (ретроспектива красной полосы). */
  wallNowMs: number = Date.now(),
): StateSegmentUtc[] {
  if (windowEnd <= windowStart) return [];
  const out: StateSegmentUtc[] = [];
  let cursor = windowStart;

  while (cursor < windowEnd) {
    const pos = moscowPositionInCycle(cursor, 0);
    const cycleStartUtc = cursor - pos;
    const meta = stateMetaAtCyclePos(pos, cycleStartUtc, machineName, wallNowMs);
    const state = meta?.state ?? "up";
    const nextOffset = meta?.endOffsetMs ?? CYCLE_MS;
    let segEnd = Math.min(windowEnd, cursor + (nextOffset - pos));
    if (segEnd <= cursor) {
      segEnd = Math.min(windowEnd, cursor + 1000);
    }
    const effectiveStartUtc = cycleStartUtc + (meta?.effectiveStartOffsetMs ?? pos);
    const logicalEndUtc = cycleStartUtc + (meta?.phaseEndOffsetMs ?? nextOffset);

    let segmentStartUtc = cursor;
    if (state === "equip_idle" && effectiveStartUtc < segmentStartUtc) {
      segmentStartUtc = Math.max(windowStart, effectiveStartUtc);
    }

    const prev = out[out.length - 1];
    if (
      prev &&
      prev.state === state &&
      prev.endUtc >= segmentStartUtc - 1 &&
      prev.effectiveStartUtc === effectiveStartUtc &&
      prev.logicalEndUtc === logicalEndUtc
    ) {
      prev.endUtc = segEnd;
    } else {
      out.push({
        state,
        startUtc: segmentStartUtc,
        endUtc: segEnd,
        effectiveStartUtc,
        logicalEndUtc,
      });
    }
    cursor = segEnd;
  }
  return out;
}

export function segmentBlocks(): { state: MachineState; start: number; end: number }[] {
  const blocks = buildRawBlocks("haas");
  const out: { state: MachineState; start: number; end: number }[] = [];
  for (const b of blocks) {
    if (b.kind === "up") {
      out.push({ state: "up", start: b.start, end: b.end });
      continue;
    }
    const D = b.end - b.start;
    if (D <= TECH_IDLE_LIMIT_MS) {
      out.push({ state: "tech_idle", start: b.start, end: b.end });
    } else {
      const split = b.start + TECH_IDLE_LIMIT_MS;
      out.push({ state: "tech_idle", start: b.start, end: split });
      out.push({ state: "equip_idle", start: split, end: b.end });
    }
  }
  return out;
}

/** Только участки [0, t) — для постепенной отрисовки «прошлого». */
export function segmentsElapsedThrough(
  t: number,
): { state: MachineState; start: number; end: number }[] {
  if (t <= 0) return [];
  const cap = Math.min(t, CYCLE_MS);
  const out: { state: MachineState; start: number; end: number }[] = [];
  for (const b of segmentBlocks()) {
    const lo = b.start;
    const hi = Math.min(b.end, cap);
    if (hi > lo) {
      out.push({ state: b.state, start: lo, end: hi });
    }
    if (b.end >= cap) break;
  }
  return out;
}
