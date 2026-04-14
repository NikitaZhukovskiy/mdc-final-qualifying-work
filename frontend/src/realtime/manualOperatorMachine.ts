import type { Equipment } from "../api";

/** Пульт оператора — один станок в этом режиме. */
export const MANUAL_OPERATOR_SERIAL = "CNC-OP-PANEL-VF2-01";

/** Станок только для ручного ввода в мониторинге (не в общем каталоге). */
export const MANUAL_MONITORING_SERIAL = "CNC-MANUAL-RT-01";

export function isManualOperatorMachine(
  eq: Pick<Equipment, "serial_number"> | null | undefined,
): boolean {
  return (eq?.serial_number ?? "") === MANUAL_OPERATOR_SERIAL;
}

/** Ручной таймлайн localStorage (пульт + мониторинг). */
export function isManualTimelineCnc(
  eq: Pick<Equipment, "serial_number"> | null | undefined,
): boolean {
  const s = eq?.serial_number ?? "";
  return s === MANUAL_OPERATOR_SERIAL || s === MANUAL_MONITORING_SERIAL;
}

/** Скрыт из каталога оборудования (только мониторинг / пульт). */
export function isHiddenFromEquipmentCatalog(
  eq: Pick<Equipment, "serial_number"> | null | undefined,
): boolean {
  return isManualOperatorMachine(eq) || (eq?.serial_number ?? "") === MANUAL_MONITORING_SERIAL;
}
