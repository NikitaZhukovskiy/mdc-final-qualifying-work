import type { Equipment } from "../api";
import { machineStateForCncEquipment } from "./cncEquipmentBridge";
import { cncUpProgramProgressAtUtc, machineStateAtUtc } from "./cycle";
import { getOperatorSimulatedMetrics } from "./operatorSimulatedMetrics";
import { isManualTimelineCnc } from "./manualOperatorMachine";

export type CncProgramCompletionOverride = {
  /** Фактически отработанное время УП (мс). */
  elapsedMs?: number;
  /** Плановая полная длительность УП (мс). */
  plannedDurationMs?: number;
};

export function cncInterfaceProtocol(equipmentName: string): string {
  const n = equipmentName.toLowerCase();
  if (n.includes("dmg") || n.includes("mori")) return "Siemens / Modbus";
  return "Fanuc / Modbus";
}

export type CncLiveRow = { key: string; value: string; unit: string | null };

/** Параметры для карточки детализации ЧПУ: при «Работа по УП» — демо-значения, иначе нули. */
export function cncLiveCharacteristicRows(
  equipmentName: string,
  nowMs: number,
  programOverride?: CncProgramCompletionOverride | null,
): CncLiveRow[] {
  const state = machineStateAtUtc(nowMs, equipmentName);
  const iface = cncInterfaceProtocol(equipmentName);
  const idleRows: CncLiveRow[] = [
    { key: "Рабочий ход (X / Y / Z)", value: "0 / 0 / 0", unit: "мм" },
    { key: "Скорость вращения шпинделя", value: "0", unit: "об/мин" },
    { key: "Мощность шпинделя", value: "0", unit: "кВт" },
    { key: "Интерфейс / протокол", value: iface, unit: null },
    { key: "Шкала выполнения УП", value: "0", unit: "%" },
  ];

  if (state !== "up") {
    return idleRows;
  }

  const up = cncUpProgramProgressAtUtc(nowMs, equipmentName);
  let progressPct: number;
  if (
    programOverride?.elapsedMs != null &&
    programOverride?.plannedDurationMs != null &&
    programOverride.plannedDurationMs > 0
  ) {
    progressPct = Math.min(
      100,
      (programOverride.elapsedMs / programOverride.plannedDurationMs) * 100,
    );
  } else {
    progressPct = up.progressPct;
  }

  const t = nowMs / 1000;
  const seed = equipmentName.length;
  const rpm = Math.round(
    3200 + 3800 * (0.5 + 0.5 * Math.sin(t / 19 + seed)),
  );
  const kw = Math.round((3.2 + 4.1 * (0.5 + 0.5 * Math.sin(t / 27 + seed * 0.3))) * 10) / 10;

  const maxX = 762;
  const maxY = 406;
  const maxZ = 508;
  const f = progressPct / 100;
  const px = Math.round(maxX * f * (0.85 + 0.1 * Math.sin(t / 11 + seed)));
  const py = Math.round(maxY * f * (0.88 + 0.08 * Math.sin(t / 13)));
  const pz = Math.round(maxZ * f * (0.9 + 0.06 * Math.sin(t / 15)));

  return [
    { key: "Рабочий ход (X / Y / Z)", value: `${px} / ${py} / ${pz}`, unit: "мм" },
    { key: "Скорость вращения шпинделя", value: String(rpm), unit: "об/мин" },
    { key: "Мощность шпинделя", value: String(kw), unit: "кВт" },
    { key: "Интерфейс / протокол", value: iface, unit: null },
    { key: "Шкала выполнения УП", value: progressPct.toFixed(1), unit: "%" },
  ];
}

/** Учитывает станок с ручным пультом (без демо-цикла). */
export function cncLiveCharacteristicRowsForEquipment(
  equipment: Pick<Equipment, "id" | "name" | "serial_number">,
  nowMs: number,
  programOverride?: CncProgramCompletionOverride | null,
): CncLiveRow[] {
  if (!isManualTimelineCnc(equipment)) {
    return cncLiveCharacteristicRows(equipment.name, nowMs, programOverride);
  }

  const state = machineStateForCncEquipment(nowMs, equipment);
  const iface = cncInterfaceProtocol(equipment.name);
  const idleRows: CncLiveRow[] = [
    { key: "Рабочий ход (X / Y / Z)", value: "0 / 0 / 0", unit: "мм" },
    { key: "Скорость вращения шпинделя", value: "0", unit: "об/мин" },
    { key: "Мощность шпинделя", value: "0", unit: "кВт" },
    { key: "Интерфейс / протокол", value: iface, unit: null },
    { key: "Шкала выполнения УП", value: "0", unit: "%" },
  ];

  if (state !== "up") {
    return idleRows;
  }

  const sim = getOperatorSimulatedMetrics(equipment.id, nowMs);
  let progressPct = sim.programPct;
  if (
    programOverride?.elapsedMs != null &&
    programOverride?.plannedDurationMs != null &&
    programOverride.plannedDurationMs > 0
  ) {
    progressPct = Math.min(
      100,
      (programOverride.elapsedMs / programOverride.plannedDurationMs) * 100,
    );
  }
  const rpm = Math.round(sim.spindleRpm);
  const kw =
    rpm > 0 ? Math.round((2.2 + (rpm / 10000) * 11) * 10) / 10 : 0;
  const travel = sim.travel?.trim() || "0 / 0 / 0";

  return [
    { key: "Рабочий ход (X / Y / Z)", value: travel, unit: "мм" },
    { key: "Скорость вращения шпинделя", value: String(rpm), unit: "об/мин" },
    { key: "Мощность шпинделя", value: String(kw), unit: "кВт" },
    { key: "Интерфейс / протокол", value: iface, unit: null },
    { key: "Шкала выполнения УП", value: progressPct.toFixed(1), unit: "%" },
  ];
}
