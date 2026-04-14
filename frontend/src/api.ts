const base = "";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type Characteristic = {
  id: number;
  key: string;
  value: string;
  unit: string | null;
};

export type CharacteristicInput = {
  key: string;
  value: string;
  unit?: string | null;
};

export type Equipment = {
  id: number;
  name: string;
  equipment_type: string | null;
  status: string;
  location: string | null;
  serial_number: string | null;
  notes: string | null;
  characteristics: Characteristic[];
};

export type MetricSummary = {
  equipment_id: number;
  metrics: Record<string, number>;
  last_recorded_at: string | null;
};

export type MetricReading = {
  id: number;
  equipment_id: number;
  metric_key: string;
  value: number;
  recorded_at: string;
};

export function fetchEquipmentList(): Promise<Equipment[]> {
  return fetch(`${base}/api/v1/equipment`).then(parseJson);
}

export function fetchEquipment(id: number): Promise<Equipment> {
  return fetch(`${base}/api/v1/equipment/${id}`).then(parseJson);
}

export function fetchLatestMetrics(id: number): Promise<MetricSummary> {
  return fetch(`${base}/api/v1/metrics/equipment/${id}/latest`).then(parseJson);
}

export function fetchReadings(
  id: number,
  limit = 200,
): Promise<MetricReading[]> {
  return fetch(
    `${base}/api/v1/metrics/equipment/${id}/readings?limit=${limit}`,
  ).then(parseJson);
}

export type EquipmentCreate = {
  name: string;
  equipment_type?: string | null;
  status?: string;
  location?: string | null;
  serial_number?: string | null;
  notes?: string | null;
  characteristics?: CharacteristicInput[];
};

export type EquipmentPatch = Partial<{
  name: string;
  equipment_type: string | null;
  status: string;
  location: string | null;
  serial_number: string | null;
  notes: string | null;
}>;

export function createEquipment(payload: EquipmentCreate): Promise<Equipment> {
  return fetch(`${base}/api/v1/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseJson);
}

export function patchEquipment(id: number, payload: EquipmentPatch): Promise<Equipment> {
  return fetch(`${base}/api/v1/equipment/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parseJson);
}

export function replaceCharacteristics(
  id: number,
  items: CharacteristicInput[],
): Promise<Equipment> {
  return fetch(`${base}/api/v1/equipment/${id}/characteristics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  }).then(parseJson);
}
