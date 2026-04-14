import type { Equipment } from "../api";
import { buildStateSegmentsForWindow, machineStateAtUtc, type MachineState, type StateSegmentUtc } from "./cycle";
import { getManualMachineStateAt, buildManualStateSegmentsForWindow } from "./manualCncTimeline";
import { isManualTimelineCnc } from "./manualOperatorMachine";

export function machineStateForCncEquipment(
  nowMs: number,
  equipment: Pick<Equipment, "id" | "name" | "serial_number">,
): MachineState {
  if (isManualTimelineCnc(equipment)) {
    return getManualMachineStateAt(equipment.id, nowMs);
  }
  return machineStateAtUtc(nowMs, equipment.name);
}

export function buildCncSegmentsForWindow(
  windowStart: number,
  windowEnd: number,
  equipment: Pick<Equipment, "id" | "name" | "serial_number">,
  wallNowMs: number,
): StateSegmentUtc[] {
  if (isManualTimelineCnc(equipment)) {
    return buildManualStateSegmentsForWindow(windowStart, windowEnd, equipment.id, wallNowMs);
  }
  return buildStateSegmentsForWindow(windowStart, windowEnd, equipment.name, wallNowMs);
}
