import type { MachineState } from "./cycle";
import { HISTORY_START_UTC_MS } from "./cycle";
import type { StateSegmentUtc } from "./cycle";

export type ManualSegment = {
  state: MachineState;
  startUtc: number;
  endUtc: number | null;
};

export type ManualTimelinePayload = {
  segments: ManualSegment[];
  programPct: number;
  spindleRpm: number;
  travel: string;
};

/** После «Работа по УП» — тех. простой, затем простой оборудования (автоматически). */
export const OPERATOR_UP_DURATION_MS = 10 * 60 * 1000;
export const OPERATOR_TECH_DURATION_MS = 5 * 60 * 1000;

const storageKey = (equipmentId: number) => `mdc-manual-cnc-v1-${equipmentId}`;

function defaultPayload(): ManualTimelinePayload {
  return {
    segments: [{ state: "off", startUtc: HISTORY_START_UTC_MS, endUtc: null }],
    programPct: 0,
    spindleRpm: 0,
    travel: "0 / 0 / 0",
  };
}

function readPayloadRaw(equipmentId: number): ManualTimelinePayload {
  try {
    const raw = localStorage.getItem(storageKey(equipmentId));
    if (!raw) return defaultPayload();
    const parsed = JSON.parse(raw) as ManualTimelinePayload;
    if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      return defaultPayload();
    }
    return {
      segments: parsed.segments.map((s) => ({
        state: s.state,
        startUtc: Number(s.startUtc),
        endUtc: s.endUtc == null ? null : Number(s.endUtc),
      })),
      programPct: typeof parsed.programPct === "number" ? parsed.programPct : 0,
      spindleRpm: typeof parsed.spindleRpm === "number" ? parsed.spindleRpm : 0,
      travel: typeof parsed.travel === "string" ? parsed.travel : "0 / 0 / 0",
    };
  } catch {
    return defaultPayload();
  }
}

function writeManualTimeline(equipmentId: number, payload: ManualTimelinePayload) {
  localStorage.setItem(storageKey(equipmentId), JSON.stringify(payload));
  window.dispatchEvent(
    new CustomEvent("mdc-manual-timeline-changed", { detail: { equipmentId } }),
  );
}

const H_MS = 60 * 60 * 1000;

/** Смена 1: 07–15, смена 2: 15–23, смена 3: 23–07 (локальное время браузера). */
export function getCurrentShiftBoundsUtc(nowMs: number): { startMs: number; endMs: number } {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const h = d.getHours();

  const dayStart = new Date(y, mo, day).getTime();

  if (h >= 7 && h < 15) {
    return { startMs: dayStart + 7 * H_MS, endMs: dayStart + 15 * H_MS };
  }
  if (h >= 15 && h < 23) {
    return { startMs: dayStart + 15 * H_MS, endMs: dayStart + 23 * H_MS };
  }
  if (h >= 23) {
    const nextDayStart = new Date(y, mo, day + 1).getTime();
    return { startMs: dayStart + 23 * H_MS, endMs: nextDayStart + 7 * H_MS };
  }
  const prevDayStart = new Date(y, mo, day - 1).getTime();
  return { startMs: prevDayStart + 23 * H_MS, endMs: dayStart + 7 * H_MS };
}

export function formatShiftRangeLabel(nowMs: number): string {
  const { startMs, endMs } = getCurrentShiftBoundsUtc(nowMs);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${new Date(startMs).toLocaleTimeString("ru-RU", opts)} – ${new Date(endMs).toLocaleTimeString("ru-RU", opts)}`;
}

const DOWNTIME_STATES: MachineState[] = [
  "tech_idle",
  "equip_idle",
  "lunch",
  "service",
  "accident",
];

export type DowntimePeriodRow = {
  startUtc: number;
  endUtc: number;
  state: MachineState;
  /** Можно заменить на обед / обслуживание / аварию (только тех. и простой оборудования). */
  canAssignReason: boolean;
};

/** Простои в текущей смене (обрезка по границам смены). */
export function listDowntimePeriodsInCurrentShift(
  equipmentId: number,
  nowUtc: number,
): DowntimePeriodRow[] {
  ensureAutoPhasesAdvanced(equipmentId, nowUtc);
  const { startMs, endMs } = getCurrentShiftBoundsUtc(nowUtc);
  const p = readPayloadRaw(equipmentId);
  const out: DowntimePeriodRow[] = [];

  for (const seg of p.segments) {
    if (!DOWNTIME_STATES.includes(seg.state)) continue;
    const segEnd = seg.endUtc ?? nowUtc;
    if (segEnd <= startMs || seg.startUtc >= endMs) continue;
    const a = Math.max(seg.startUtc, startMs);
    const b = Math.min(segEnd, endMs);
    if (b <= a) continue;
    out.push({
      startUtc: a,
      endUtc: b,
      state: seg.state,
      canAssignReason: seg.state === "tech_idle" || seg.state === "equip_idle",
    });
  }
  return out.sort((x, y) => x.startUtc - y.startUtc);
}

function mergeAdjacentSegments(segments: ManualSegment[]): ManualSegment[] {
  if (segments.length <= 1) return segments;
  const out: ManualSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.state === seg.state &&
      prev.endUtc !== null &&
      prev.endUtc === seg.startUtc
    ) {
      prev.endUtc = seg.endUtc;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Заменяет на [rangeStart, rangeEnd] состояние reason для сегментов tech_idle/equip_idle.
 * Диапазон должен лежать в текущей смене; на диаграмме прямоугольник станет lunch/service/accident с тем же временем.
 */
export function replaceIdleRangeWithReason(
  equipmentId: number,
  rangeStart: number,
  rangeEnd: number,
  reason: "lunch" | "service" | "accident",
  nowUtc: number,
): boolean {
  const { startMs: shiftStart, endMs: shiftEnd } = getCurrentShiftBoundsUtc(nowUtc);
  if (rangeEnd <= rangeStart) return false;
  if (rangeStart < shiftStart || rangeEnd > shiftEnd) return false;

  ensureAutoPhasesAdvanced(equipmentId, nowUtc);
  const p = readPayloadRaw(equipmentId);
  const nextSegs: ManualSegment[] = [];

  for (const seg of p.segments) {
    const segEnd = seg.endUtc ?? nowUtc;
    if (segEnd <= rangeStart || seg.startUtc >= rangeEnd) {
      nextSegs.push(seg);
      continue;
    }
    if (seg.state !== "tech_idle" && seg.state !== "equip_idle") {
      nextSegs.push(seg);
      continue;
    }
    const a = Math.max(seg.startUtc, rangeStart);
    const b = Math.min(segEnd, rangeEnd);
    if (b <= a) {
      nextSegs.push(seg);
      continue;
    }
    if (seg.startUtc < a) {
      nextSegs.push({ state: seg.state, startUtc: seg.startUtc, endUtc: a });
    }
    nextSegs.push({ state: reason, startUtc: a, endUtc: b });
    if (b < segEnd) {
      nextSegs.push({ state: seg.state, startUtc: b, endUtc: seg.endUtc });
    }
  }

  const merged = mergeAdjacentSegments(nextSegs);
  writeManualTimeline(equipmentId, { ...p, segments: merged });
  return true;
}

function closeOpenSegment(payload: ManualTimelinePayload, endUtc: number) {
  const last = payload.segments[payload.segments.length - 1];
  if (last && last.endUtc === null) {
    last.endUtc = endUtc;
  }
}

/**
 * Закрывает открытый UP по истечении 10 мин → тех. простой; через 5 мин тех. простоя → простой оборудования.
 */
export function ensureAutoPhasesAdvanced(equipmentId: number, nowUtc: number) {
  const p = readPayloadRaw(equipmentId);
  let changed = false;
  for (;;) {
    const last = p.segments[p.segments.length - 1];
    if (!last || last.endUtc !== null) break;

    if (last.state === "up") {
      const endAt = last.startUtc + OPERATOR_UP_DURATION_MS;
      if (nowUtc >= endAt) {
        closeOpenSegment(p, endAt);
        p.segments.push({ state: "tech_idle", startUtc: endAt, endUtc: null });
        changed = true;
        continue;
      }
      break;
    }

    if (last.state === "tech_idle") {
      const endAt = last.startUtc + OPERATOR_TECH_DURATION_MS;
      if (nowUtc >= endAt) {
        closeOpenSegment(p, endAt);
        p.segments.push({ state: "equip_idle", startUtc: endAt, endUtc: null });
        changed = true;
        continue;
      }
      break;
    }

    break;
  }
  if (changed) {
    writeManualTimeline(equipmentId, p);
  }
}

export function readManualTimeline(equipmentId: number, nowUtc = Date.now()): ManualTimelinePayload {
  ensureAutoPhasesAdvanced(equipmentId, nowUtc);
  return readPayloadRaw(equipmentId);
}

export function getManualMachineStateAt(equipmentId: number, nowUtc: number): MachineState {
  ensureAutoPhasesAdvanced(equipmentId, nowUtc);
  const p = readPayloadRaw(equipmentId);
  for (let i = p.segments.length - 1; i >= 0; i--) {
    const s = p.segments[i];
    const end = s.endUtc ?? nowUtc;
    if (s.startUtc <= nowUtc && nowUtc < end) return s.state;
  }
  const last = p.segments[p.segments.length - 1];
  return last?.state ?? "off";
}

export function getOpenSegmentState(equipmentId: number, nowUtc = Date.now()): ManualSegment | null {
  ensureAutoPhasesAdvanced(equipmentId, nowUtc);
  const p = readPayloadRaw(equipmentId);
  const last = p.segments[p.segments.length - 1];
  if (!last || last.endUtc !== null) return null;
  return last;
}

export function commitManualBaseState(equipmentId: number, state: MachineState, now = Date.now()) {
  ensureAutoPhasesAdvanced(equipmentId, now);
  const p = readPayloadRaw(equipmentId);
  closeOpenSegment(p, now);
  p.segments.push({ state, startUtc: now, endUtc: null });
  writeManualTimeline(equipmentId, p);
}

export function commitManualIdleReason(
  equipmentId: number,
  reason: "lunch" | "service" | "accident",
): boolean {
  const now = Date.now();
  ensureAutoPhasesAdvanced(equipmentId, now);
  const p = readPayloadRaw(equipmentId);
  const last = p.segments[p.segments.length - 1];
  if (!last || last.endUtc !== null) return false;
  if (last.state !== "tech_idle" && last.state !== "equip_idle") return false;
  last.state = reason;
  writeManualTimeline(equipmentId, p);
  return true;
}

export function clearManualReasonToUp(equipmentId: number, now = Date.now()) {
  ensureAutoPhasesAdvanced(equipmentId, now);
  const p = readPayloadRaw(equipmentId);
  const last = p.segments[p.segments.length - 1];
  if (!last || last.endUtc !== null) return false;
  if (last.state !== "lunch" && last.state !== "service" && last.state !== "accident") {
    return false;
  }
  closeOpenSegment(p, now);
  p.segments.push({ state: "up", startUtc: now, endUtc: null });
  writeManualTimeline(equipmentId, p);
  return true;
}

export function buildManualStateSegmentsForWindow(
  windowStart: number,
  windowEnd: number,
  equipmentId: number,
  wallNowMs: number,
): StateSegmentUtc[] {
  if (windowEnd <= windowStart) return [];
  ensureAutoPhasesAdvanced(equipmentId, wallNowMs);
  const p = readPayloadRaw(equipmentId);
  const out: StateSegmentUtc[] = [];

  for (const seg of p.segments) {
    const end = seg.endUtc ?? wallNowMs;
    if (end <= windowStart) continue;
    if (seg.startUtc >= windowEnd) continue;
    const a = Math.max(windowStart, seg.startUtc);
    const b = Math.min(windowEnd, end);
    if (b <= a) continue;
    out.push({
      state: seg.state,
      startUtc: a,
      endUtc: b,
      effectiveStartUtc: seg.startUtc,
      logicalEndUtc: end,
    });
  }

  if (out.length === 0) {
    return [
      {
        state: "off",
        startUtc: windowStart,
        endUtc: windowEnd,
        effectiveStartUtc: windowStart,
        logicalEndUtc: windowEnd,
      },
    ];
  }

  return out;
}
