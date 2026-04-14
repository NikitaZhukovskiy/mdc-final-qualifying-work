import type { MachineState } from "./cycle";

const KEY = "mdc-cnc-scenarios-v1";

export type CncScenarioStep = {
  state: MachineState;
  minutes: number;
};

type ScenarioMap = Record<string, CncScenarioStep[]>;

function cleanSteps(steps: CncScenarioStep[]): CncScenarioStep[] {
  let total = 0;
  const out: CncScenarioStep[] = [];
  for (const s of steps) {
    const m = Math.max(0, Math.floor(Number(s.minutes) || 0));
    if (!s.state || m <= 0) continue;
    if (total >= 60) break;
    const take = Math.min(m, 60 - total);
    out.push({ state: s.state, minutes: take });
    total += take;
  }
  return out;
}

function readMap(): ScenarioMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ScenarioMap;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ScenarioMap = {};
    for (const [name, arr] of Object.entries(parsed)) {
      if (!Array.isArray(arr) || !name.trim()) continue;
      out[name] = cleanSteps(arr as CncScenarioStep[]);
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: ScenarioMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("mdc-cnc-scenarios-changed"));
}

export function getCncScenarioByName(machineName: string): CncScenarioStep[] | null {
  const k = machineName.trim();
  if (!k) return null;
  const map = readMap();
  const steps = map[k];
  if (!steps || steps.length === 0) return null;
  return cleanSteps(steps);
}

export function setCncScenarioByName(machineName: string, steps: CncScenarioStep[]) {
  const k = machineName.trim();
  if (!k) return;
  const map = readMap();
  const cleaned = cleanSteps(steps);
  if (cleaned.length === 0) {
    delete map[k];
  } else {
    map[k] = cleaned;
  }
  writeMap(map);
}

export function moveCncScenarioName(oldName: string, newName: string) {
  const oldK = oldName.trim();
  const newK = newName.trim();
  if (!oldK || !newK || oldK === newK) return;
  const map = readMap();
  if (!map[oldK]) return;
  map[newK] = map[oldK];
  delete map[oldK];
  writeMap(map);
}
