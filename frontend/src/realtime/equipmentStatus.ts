import type { Equipment } from "../api";
import { machineStateForCncEquipment } from "./cncEquipmentBridge";
import type { MachineState } from "./cycle";

export type EquipmentStatusKey =
  | MachineState
  | "online"
  | "offline"
  | "maintenance"
  | "error";

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatusKey, string> = {
  on: "Включен",
  up: "Работа по УП",
  off: "Выключен",
  tech_idle: "Технический простой",
  equip_idle: "Простой оборудования",
  lunch: "Обед",
  service: "Обслуживание оборудования",
  accident: "Авария",
  online: "В сети",
  offline: "Не в сети",
  maintenance: "Обслуживание",
  error: "Авария",
};

export function isCncType(type: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t.includes("чпу") || t.includes("cnc") || t.includes("станок с пу") || t.includes("пу");
}

export function statusForEquipment(
  equipment: Pick<Equipment, "id" | "name" | "equipment_type" | "status" | "serial_number">,
  nowMs: number,
): EquipmentStatusKey {
  if (isCncType(equipment.equipment_type)) {
    return machineStateForCncEquipment(nowMs, equipment);
  }
  const key = equipment.status as EquipmentStatusKey;
  if (key in EQUIPMENT_STATUS_LABEL) return key;
  return "offline";
}
