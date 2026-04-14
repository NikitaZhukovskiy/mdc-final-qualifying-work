import { OPERATOR_UP_DURATION_MS, getOpenSegmentState } from "./manualCncTimeline";

/** «Данные со станка» на пульте и в карточке оборудования для ручного VF-2 во время УП. */
export function getOperatorSimulatedMetrics(
  equipmentId: number,
  nowUtc: number,
): { programPct: number; spindleRpm: number; travel: string } {
  const open = getOpenSegmentState(equipmentId, nowUtc);
  if (!open || open.state !== "up") {
    return { programPct: 0, spindleRpm: 0, travel: "0 / 0 / 0" };
  }

  const elapsed = Math.max(0, nowUtc - open.startUtc);
  const frac = Math.min(1, elapsed / OPERATOR_UP_DURATION_MS);
  const programPct = frac * 100;

  const t = nowUtc / 1000;
  const seed = equipmentId;
  const rpm = Math.round(
    3000 + 4200 * (0.5 + 0.5 * Math.sin(t / 18 + seed * 0.7)),
  );

  const maxX = 762;
  const maxY = 406;
  const maxZ = 508;
  const px = Math.round(maxX * frac * (0.82 + 0.12 * Math.sin(t / 12 + seed)));
  const py = Math.round(maxY * frac * (0.86 + 0.1 * Math.sin(t / 14)));
  const pz = Math.round(maxZ * frac * (0.88 + 0.08 * Math.sin(t / 16)));

  return {
    programPct,
    spindleRpm: rpm,
    travel: `${px} / ${py} / ${pz}`,
  };
}
