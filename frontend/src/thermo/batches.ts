export type ThermoBatch = {
  id: number;
  batchNo: number;
  furnaceId: number;
  furnaceName: string;
  durationMinutes: string;
  routeCardNo: string;
  partName: string;
  quantity: string;
  operator: string;
  foreman: string;
  controller: string;
  setpointTemp: string;
  operationType: string;
  startedAtUtcMs: number;
};

const KEY = "mdc-thermo-batches";

const DEMO_BATCH_ROUTE = "123123";
const DEMO_BATCH_START_UTC_MS = Date.UTC(2026, 3, 13, 11, 40, 0, 0); // 13.04.2026 14:40 МСК
const DEMO_BATCH_MINUTES = "50";

function normalize(items: ThermoBatch[]): ThermoBatch[] {
  return items.map((x) => {
    const legacy = x as unknown as { durationHours?: string };
    const normalizedDuration =
      typeof x.durationMinutes === "string" && x.durationMinutes.trim()
        ? x.durationMinutes
        : typeof legacy.durationHours === "string" && legacy.durationHours.trim()
          ? String(Math.round(Number.parseFloat(legacy.durationHours.replace(",", ".")) * 60))
          : "60";
    return {
      ...x,
      durationMinutes: normalizedDuration,
      setpointTemp:
        typeof x.setpointTemp === "string" && x.setpointTemp.trim() ? x.setpointTemp : "900",
      operationType: typeof x.operationType === "string" ? x.operationType : "",
    };
  });
}

function ensureDemoCompletedBatch(items: ThermoBatch[]): ThermoBatch[] {
  const hasDemo = items.some(
    (x) =>
      x.routeCardNo === DEMO_BATCH_ROUTE &&
      x.startedAtUtcMs === DEMO_BATCH_START_UTC_MS &&
      x.durationMinutes === DEMO_BATCH_MINUTES,
  );
  if (hasDemo) return items;

  const maxId = items.reduce((m, x) => Math.max(m, x.id), -1);
  const maxBatchNo = items.reduce((m, x) => Math.max(m, x.batchNo), -1);
  const demo: ThermoBatch = {
    id: maxId + 1,
    batchNo: maxBatchNo + 1,
    furnaceId: 4,
    furnaceName: "Печь Nabertherm N 300/65",
    durationMinutes: DEMO_BATCH_MINUTES,
    routeCardNo: DEMO_BATCH_ROUTE,
    partName: "1",
    quantity: "1",
    operator: "1",
    foreman: "1",
    controller: "1",
    setpointTemp: "900",
    operationType: "Отжиг (демо)",
    startedAtUtcMs: DEMO_BATCH_START_UTC_MS,
  };
  return [...items, demo];
}

function read(): ThermoBatch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const withDemo = ensureDemoCompletedBatch([]);
      write(withDemo);
      return withDemo;
    }
    const parsed = JSON.parse(raw) as ThermoBatch[];
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed
      .filter((x) => typeof x?.id === "number" && typeof x?.furnaceId === "number")
      .map((x) => x as ThermoBatch);
    const normalized = normalize(filtered);
    const withDemo = ensureDemoCompletedBatch(normalized);
    if (withDemo.length !== normalized.length || JSON.stringify(withDemo) !== JSON.stringify(filtered)) {
      write(withDemo);
    }
    return withDemo;
  } catch {
    return [];
  }
}

function write(items: ThermoBatch[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function listThermoBatches(): ThermoBatch[] {
  return read().sort((a, b) => a.id - b.id);
}

export function getThermoBatch(batchId: number): ThermoBatch | null {
  return read().find((x) => x.id === batchId) ?? null;
}

export function createThermoBatch(
  data: Omit<ThermoBatch, "id" | "batchNo" | "startedAtUtcMs">,
): ThermoBatch {
  const all = read();
  const maxId = all.reduce((m, x) => Math.max(m, x.id), -1);
  const maxBatch = all.reduce((m, x) => Math.max(m, x.batchNo), -1);
  const created: ThermoBatch = {
    ...data,
    id: maxId + 1,
    batchNo: maxBatch + 1,
    startedAtUtcMs: Date.now(),
  };
  all.push(created);
  write(all);
  return created;
}

export function updateThermoBatch(batchId: number, patch: Partial<ThermoBatch>): ThermoBatch | null {
  const all = read();
  const idx = all.findIndex((x) => x.id === batchId);
  if (idx === -1) return null;
  const next = { ...all[idx], ...patch, id: all[idx].id, batchNo: all[idx].batchNo };
  all[idx] = next;
  write(all);
  return next;
}

function parseDurationHours(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

export function getBatchEndUtcMs(batch: ThermoBatch): number {
  return batch.startedAtUtcMs + parseDurationHours(batch.durationMinutes) * 60 * 1000;
}

export function isBatchActive(batch: ThermoBatch, nowUtcMs: number): boolean {
  return nowUtcMs < getBatchEndUtcMs(batch);
}

export function getActiveBatchForFurnace(furnaceId: number, nowUtcMs: number): ThermoBatch | null {
  const all = read();
  return all.find((x) => x.furnaceId === furnaceId && isBatchActive(x, nowUtcMs)) ?? null;
}
