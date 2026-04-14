import { useEffect, useMemo, useState } from "react";
import {
  createEquipment,
  fetchEquipmentList,
  patchEquipment,
  replaceCharacteristics,
  type Equipment,
} from "../api";
import {
  ALL_PERMISSION_IDS,
  accountToSession,
  addCustomAccount,
  defaultPermissionsForRole,
  getAccountForEdit,
  getSession,
  listAccountsForAdmin,
  roleLabel,
  saveSession,
  updateCustomAccount,
  type PermissionId,
  type UserRole,
} from "../auth";
import {
  CHART_COLOR_KEYS,
  CHART_PALETTE,
  CHART_WIDTH_KEY,
  getChartColor,
  isAllowedChartColor,
  notifyChartPrefsChanged,
} from "../chartPrefs";
import { STATE_LABEL, type MachineState } from "../realtime/cycle";
import {
  getCncScenarioByName,
  moveCncScenarioName,
  setCncScenarioByName,
  type CncScenarioStep,
} from "../realtime/cncScenarioConfig";

function parseCharacteristics(text: string) {
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [left, unitRaw] = line.split("|").map((x) => x.trim());
    const [key, value] = left.split("=").map((x) => x.trim());
    if (!key || !value) {
      throw new Error("Формат характеристик: Параметр=Значение|Ед");
    }
    return { key, value, unit: unitRaw || null };
  });
}

const PERM_LABELS: Record<PermissionId, string> = {
  nav_equipment: "Раздел «Оборудование»",
  nav_realtime: "Мониторинг в реальном времени",
  nav_thermo: "Термообработка",
  nav_admin: "Администрирование",
  thermo_start_batch: "Запуск садки",
  operator_panel: "Пульт оператора (статусы вручную)",
  report_cnc_create: "Создание отчетов по станкам с ПУ",
  report_thermo_create: "Создание отчетов по печам",
};

const PERMISSION_GROUPS: Array<{ title: string; ids: PermissionId[] }> = [
  { title: "Навигация", ids: ["nav_equipment", "nav_realtime", "nav_thermo"] },
  { title: "Операции", ids: ["thermo_start_batch", "operator_panel"] },
  { title: "Отчеты", ids: ["report_cnc_create", "report_thermo_create"] },
];

const COLOR_STATE_LABEL: Record<MachineState, string> = {
  up: "Работа по УП",
  on: "Включен",
  off: "Выключен",
  tech_idle: "Технический простой",
  equip_idle: "Простой оборудования",
  lunch: "Обед",
  service: "Обслуживание",
  accident: "Авария",
};

const CHART_PREVIEW_STATES: MachineState[] = [
  "up",
  "on",
  "off",
  "tech_idle",
  "equip_idle",
  "lunch",
  "service",
  "accident",
];

type AdminPanel = "hub" | "equipment" | "charts" | "users" | "user-add" | "user-edit";

type EquipmentSubMode = "list" | "add" | "edit";

type EquipmentKindOption = "Станок с ПУ" | "Печь";
const EQUIPMENT_KIND_OPTIONS: EquipmentKindOption[] = ["Станок с ПУ", "Печь"];

const CYCLE_STATUS_OPTIONS: MachineState[] = [
  "up",
  "on",
  "off",
  "tech_idle",
  "equip_idle",
  "lunch",
  "service",
  "accident",
];

function isPuMachineType(type: string | null | undefined): boolean {
  return (type ?? "").trim().toLowerCase() === "станок с пу";
}

function normalizeCycleDraft(steps: CncScenarioStep[]): CncScenarioStep[] {
  let total = 0;
  const out: CncScenarioStep[] = [];
  for (const step of steps) {
    const minutes = Math.max(0, Math.floor(Number(step.minutes) || 0));
    if (minutes <= 0) continue;
    if (total >= 60) break;
    const take = Math.min(minutes, 60 - total);
    out.push({ state: step.state, minutes: take });
    total += take;
  }
  return out;
}

function cycleTotalMinutes(steps: CncScenarioStep[]): number {
  return normalizeCycleDraft(steps).reduce((sum, s) => sum + s.minutes, 0);
}

function cyclePreviewSegments(steps: CncScenarioStep[]) {
  const normalized = normalizeCycleDraft(steps);
  const total = cycleTotalMinutes(normalized);
  const out = normalized.map((s, idx) => ({
    ...s,
    key: `seg-${idx}-${s.state}-${s.minutes}`,
    pct: (s.minutes / 60) * 100,
  }));
  if (total < 60) {
    out.push({
      key: "remaining",
      state: null,
      minutes: 60 - total,
      pct: ((60 - total) / 60) * 100,
    });
  }
  return out;
}

function AdminChartPreview({ colors }: { colors: Record<MachineState, string> }) {
  return (
    <div className="admin-chart-preview" aria-hidden>
      <p className="muted small admin-chart-preview-title">Предпросмотр полос</p>
      <div className="admin-chart-preview-track">
        {CHART_PREVIEW_STATES.map((st) => (
          <div
            key={st}
            className="admin-chart-preview-seg"
            style={{ backgroundColor: colors[st] }}
            title={COLOR_STATE_LABEL[st]}
          />
        ))}
      </div>
      <ul className="admin-chart-preview-legend">
        {CHART_PREVIEW_STATES.map((st) => (
          <li key={st}>
            <span className="admin-chart-preview-swatch" style={{ backgroundColor: colors[st] }} />
            {COLOR_STATE_LABEL[st]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CncCycleBuilder({
  steps,
  setSteps,
  statusDraft,
  setStatusDraft,
  minutesDraft,
  setMinutesDraft,
}: {
  steps: CncScenarioStep[];
  setSteps: (value: CncScenarioStep[] | ((prev: CncScenarioStep[]) => CncScenarioStep[])) => void;
  statusDraft: MachineState;
  setStatusDraft: (v: MachineState) => void;
  minutesDraft: string;
  setMinutesDraft: (v: string) => void;
}) {
  const normalized = normalizeCycleDraft(steps);
  const total = cycleTotalMinutes(normalized);
  const left = Math.max(0, 60 - total);
  const canAdd = left > 0;
  const preview = cyclePreviewSegments(normalized);

  return (
    <div className="admin-cycle-builder">
      <p className="muted small">
        Цикл станка (максимум 60 минут). После создания цикл запускается сразу.
      </p>
      <div className="admin-cycle-preview">
        {preview.map((seg) => (
          <div
            key={seg.key}
            className={`admin-cycle-seg ${seg.state ? "" : "admin-cycle-seg--rest"}`}
            style={{
              width: `${seg.pct}%`,
              backgroundColor: seg.state ? getChartColor(seg.state) : undefined,
            }}
            title={seg.state ? `${STATE_LABEL[seg.state]} — ${seg.minutes} мин` : `Остаток ${seg.minutes} мин`}
          >
            {seg.pct > 10 && (
              <span className="admin-cycle-seg-text">
                {seg.state ? `${STATE_LABEL[seg.state]} · ${seg.minutes}м` : `${seg.minutes}м`}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="admin-cycle-list">
        {normalized.map((s, idx) => (
          <div key={`row-${idx}`} className="admin-cycle-row">
            <select
              value={s.state}
              onChange={(e) =>
                setSteps((prev) => {
                  const next = [...prev];
                  next[idx] = { ...next[idx], state: e.target.value as MachineState };
                  return normalizeCycleDraft(next);
                })
              }
            >
              {CYCLE_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {STATE_LABEL[st]}
                </option>
              ))}
            </select>
            <input
              value={String(s.minutes)}
              inputMode="numeric"
              onChange={(e) =>
                setSteps((prev) => {
                  const next = [...prev];
                  const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  next[idx] = { ...next[idx], minutes: n };
                  return normalizeCycleDraft(next);
                })
              }
            />
            <span className="muted small">мин</span>
            <button
              type="button"
              className="admin-cycle-remove"
              onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
            >
              Удалить
            </button>
          </div>
        ))}
      </div>

      <div className="admin-cycle-add-row">
        <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as MachineState)}>
          {CYCLE_STATUS_OPTIONS.map((st) => (
            <option key={st} value={st}>
              {STATE_LABEL[st]}
            </option>
          ))}
        </select>
        <input
          value={minutesDraft}
          inputMode="numeric"
          onChange={(e) => setMinutesDraft(e.target.value)}
          placeholder="мин"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => {
            const n = Math.max(0, Math.floor(Number(minutesDraft) || 0));
            if (n <= 0 || left <= 0) return;
            const take = Math.min(n, left);
            setSteps((prev) => normalizeCycleDraft([...prev, { state: statusDraft, minutes: take }]));
            setMinutesDraft(String(Math.min(5, Math.max(1, left - take))));
          }}
        >
          Добавить этап
        </button>
      </div>
      <p className="muted small">Сумма: {total} / 60 минут</p>
    </div>
  );
}

export function AdminDashboard() {
  const [panel, setPanel] = useState<AdminPanel>("hub");
  const [items, setItems] = useState<Equipment[]>([]);
  const [equipmentSubMode, setEquipmentSubMode] = useState<EquipmentSubMode>("list");
  const [editEquipmentId, setEditEquipmentId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EquipmentKindOption>("Станок с ПУ");
  const [newStatus, setNewStatus] = useState("online");
  const [newLocation, setNewLocation] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newCharText, setNewCharText] = useState("");
  const [newCycleSteps, setNewCycleSteps] = useState<CncScenarioStep[]>([
    { state: "up", minutes: 20 },
  ]);
  const [newCycleStateDraft, setNewCycleStateDraft] = useState<MachineState>("tech_idle");
  const [newCycleMinutesDraft, setNewCycleMinutesDraft] = useState("5");

  const editingEquipment = useMemo(
    () => (editEquipmentId != null ? items.find((i) => i.id === editEquipmentId) ?? null : null),
    [items, editEquipmentId],
  );

  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<EquipmentKindOption>("Станок с ПУ");
  const [editSerial, setEditSerial] = useState("");
  const [editStatus, setEditStatus] = useState("online");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editChars, setEditChars] = useState("");
  const [editCycleSteps, setEditCycleSteps] = useState<CncScenarioStep[]>([]);
  const [editCycleStateDraft, setEditCycleStateDraft] = useState<MachineState>("tech_idle");
  const [editCycleMinutesDraft, setEditCycleMinutesDraft] = useState("5");

  const [accUser, setAccUser] = useState("");
  const [accPass, setAccPass] = useState("");
  const [accRole, setAccRole] = useState<UserRole>("user");
  const [accDisplayName, setAccDisplayName] = useState("");
  const [accPerms, setAccPerms] = useState<Record<PermissionId, boolean>>(() =>
    defaultPermissionsForRole("user"),
  );
  const [accRefresh, setAccRefresh] = useState(0);

  const [editTargetUsername, setEditTargetUsername] = useState<string | null>(null);
  const [editUserLogin, setEditUserLogin] = useState("");
  const [editUserPass, setEditUserPass] = useState("");
  const [editUserDisplay, setEditUserDisplay] = useState("");
  const [editUserRole, setEditUserRole] = useState<UserRole>("user");
  const [editUserPerms, setEditUserPerms] = useState<Record<PermissionId, boolean>>(() =>
    defaultPermissionsForRole("user"),
  );

  const [chartColors, setChartColors] = useState<Record<MachineState, string>>(() => {
    const states = Object.keys(CHART_COLOR_KEYS) as MachineState[];
    return Object.fromEntries(states.map((s) => [s, getChartColor(s)])) as Record<
      MachineState,
      string
    >;
  });
  const [chartStroke, setChartStroke] = useState(
    () => localStorage.getItem(CHART_WIDTH_KEY) ?? "0",
  );

  useEffect(() => {
    function onPrefs() {
      const states = Object.keys(CHART_COLOR_KEYS) as MachineState[];
      setChartColors(
        Object.fromEntries(states.map((s) => [s, getChartColor(s)])) as Record<
          MachineState,
          string
        >,
      );
    }
    window.addEventListener("mdc-chart-prefs-changed", onPrefs);
    return () => window.removeEventListener("mdc-chart-prefs-changed", onPrefs);
  }, []);

  async function reload() {
    const data = await fetchEquipmentList();
    setItems(data);
  }

  useEffect(() => {
    reload().catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (editingEquipment) {
      setEditName(editingEquipment.name);
      setEditType(
        (editingEquipment.equipment_type as EquipmentKindOption) === "Печь"
          ? "Печь"
          : "Станок с ПУ",
      );
      setEditSerial(editingEquipment.serial_number ?? "");
      setEditStatus(editingEquipment.status);
      setEditLocation(editingEquipment.location ?? "");
      setEditNotes(editingEquipment.notes ?? "");
      setEditChars(
        editingEquipment.characteristics
          .map((c) => `${c.key}=${c.value}${c.unit ? `|${c.unit}` : ""}`)
          .join("\n"),
      );
      setEditCycleSteps(getCncScenarioByName(editingEquipment.name) ?? [{ state: "up", minutes: 20 }]);
    }
  }, [editingEquipment]);

  useEffect(() => {
    setAccPerms(defaultPermissionsForRole(accRole));
  }, [accRole]);

  useEffect(() => {
    if (panel !== "user-edit" || !editTargetUsername) return;
    const row = getAccountForEdit(editTargetUsername);
    if (!row) {
      setPanel("users");
      return;
    }
    if (row.builtIn) return;
    const a = row.account;
    setEditUserLogin(a.username);
    setEditUserPass("");
    setEditUserDisplay(a.displayName ?? "");
    setEditUserRole(a.role);
    const base = defaultPermissionsForRole(a.role);
    setEditUserPerms({ ...base, ...(a.permissions ?? {}) });
  }, [panel, editTargetUsername]);

  const accountsList = useMemo(
    () =>
      listAccountsForAdmin()
        .slice()
        .sort((a, b) => a.username.localeCompare(b.username)),
    [accRefresh, panel],
  );

  function syncSessionIfSameUser(oldLogin: string, newLogin: string) {
    const sess = getSession();
    if (!sess || sess.username.toLowerCase() !== oldLogin.toLowerCase()) return;
    const row = getAccountForEdit(newLogin);
    if (!row || row.builtIn) return;
    saveSession(accountToSession(row.account, sess.entry));
  }

  if (panel === "hub") {
    return (
      <div className="admin-page">
        <div className="page-head">
          <h1>Администрирование</h1>
          <p className="muted">
            Выберите раздел: внутри каждого блока доступны соответствующие настройки.
          </p>
        </div>
        {err && (
          <div className="card error">
            <p>{err}</p>
          </div>
        )}
        {msg && (
          <div className="card">
            <p>{msg}</p>
          </div>
        )}
        <div className="admin-hub">
          <button
            type="button"
            className="card admin-hub-card"
            onClick={() => {
              setErr(null);
              setMsg(null);
              setEquipmentSubMode("list");
              setEditEquipmentId(null);
              setPanel("equipment");
            }}
          >
            <h2>Настройка оборудования</h2>
            <p className="muted small">
              Каталог узлов: создание записей, тип, серийный номер, статус, локация, примечания и
              паспортные характеристики.
            </p>
          </button>
          <button
            type="button"
            className="card admin-hub-card"
            onClick={() => {
              setErr(null);
              setMsg(null);
              const states = Object.keys(CHART_COLOR_KEYS) as MachineState[];
              setChartColors(
                Object.fromEntries(states.map((s) => [s, getChartColor(s)])) as Record<
                  MachineState,
                  string
                >,
              );
              setChartStroke(localStorage.getItem(CHART_WIDTH_KEY) ?? "0");
              setPanel("charts");
            }}
          >
            <h2>Настройка диаграмм</h2>
            <p className="muted small">
              Цвета полос мониторинга ЧПУ для всех пользователей (общее хранилище браузера), толщина
              обводки и предпросмотр.
            </p>
          </button>
          <button
            type="button"
            className="card admin-hub-card"
            onClick={() => {
              setErr(null);
              setMsg(null);
              setPanel("users");
            }}
          >
            <h2>Настройка пользователей</h2>
            <p className="muted small">
              Список учётных записей, создание пользователей с правами, редактирование логина, ФИО,
              пароля и разрешений по имени пользователя.
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (panel === "equipment") {
    return (
      <div className="admin-page">
        <div className="page-head admin-subhead">
          <button type="button" className="admin-back-link" onClick={() => setPanel("hub")}>
            ← К администрированию
          </button>
          <h1>Настройка оборудования</h1>
          <p className="muted small">
            Список каталога: нажмите на название, чтобы изменить паспорт и характеристики. Добавление —
            кнопкой справа над таблицей.
          </p>
        </div>
        {err && (
          <div className="card error">
            <p>{err}</p>
          </div>
        )}
        {msg && (
          <div className="card">
            <p>{msg}</p>
          </div>
        )}

        {equipmentSubMode === "list" && (
          <section className="card admin-section">
            <div className="admin-equipment-toolbar">
              <h2 className="admin-equipment-toolbar-title">Оборудование</h2>
              <button
                type="button"
                className="auth-btn"
                onClick={() => {
                  setErr(null);
                  setEquipmentSubMode("add");
                }}
              >
                Добавить оборудование
              </button>
            </div>
            {items.length === 0 ? (
              <p className="muted">В каталоге пока нет записей.</p>
            ) : (
              <div className="table-wrap">
                <table className="table admin-equipment-table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Тип</th>
                      <th>Серийный номер</th>
                      <th>Локация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            className="admin-equipment-name-btn"
                            onClick={() => {
                              setErr(null);
                              setEditEquipmentId(row.id);
                              setEquipmentSubMode("edit");
                            }}
                          >
                            {row.name}
                          </button>
                        </td>
                        <td>{row.equipment_type || "—"}</td>
                        <td>{row.serial_number || "—"}</td>
                        <td>{row.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {equipmentSubMode === "add" && (
          <section className="card admin-section">
            <button
              type="button"
              className="admin-back-link"
              onClick={() => {
                setEquipmentSubMode("list");
                setErr(null);
              }}
            >
              ← К списку оборудования
            </button>
            <h2 className="admin-subh">Новое оборудование</h2>
            <form
              className="admin-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setErr(null);
                  const created = await createEquipment({
                    name: newName,
                    equipment_type: newType,
                    status: newStatus,
                    location: newLocation || null,
                    serial_number: newSerial || null,
                    characteristics: parseCharacteristics(newCharText || "Параметр=—"),
                  });
                  if (isPuMachineType(newType)) {
                    setCncScenarioByName(created.name, normalizeCycleDraft(newCycleSteps));
                  }
                  setMsg(`Оборудование создано: ${created.name}`);
                  setNewName("");
                  setNewType("Станок с ПУ");
                  setNewLocation("");
                  setNewSerial("");
                  setNewCharText("");
                  setNewCycleSteps([{ state: "up", minutes: 20 }]);
                  await reload();
                  setEquipmentSubMode("list");
                } catch (ex) {
                  setErr((ex as Error).message);
                }
              }}
            >
              <label>
                Название
                <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </label>
              <label>
                Тип
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as EquipmentKindOption)}
                >
                  {EQUIPMENT_KIND_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Серийный номер
                <input value={newSerial} onChange={(e) => setNewSerial(e.target.value)} />
              </label>
              <label>
                Статус
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                  <option value="online">online</option>
                  <option value="offline">offline</option>
                  <option value="on">on</option>
                  <option value="maintenance">maintenance</option>
                  <option value="error">error</option>
                </select>
              </label>
              <label>
                Локация
                <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
              </label>
              <label className="full">
                Характеристики (по одной в строке: Параметр=Значение|Ед)
                <textarea
                  rows={4}
                  value={newCharText}
                  onChange={(e) => setNewCharText(e.target.value)}
                />
              </label>
              {isPuMachineType(newType) && (
                <div className="full">
                  <CncCycleBuilder
                    steps={newCycleSteps}
                    setSteps={setNewCycleSteps}
                    statusDraft={newCycleStateDraft}
                    setStatusDraft={setNewCycleStateDraft}
                    minutesDraft={newCycleMinutesDraft}
                    setMinutesDraft={setNewCycleMinutesDraft}
                  />
                </div>
              )}
              <button type="submit">Добавить</button>
            </form>
          </section>
        )}

        {equipmentSubMode === "edit" && editEquipmentId != null && !editingEquipment && (
          <section className="card admin-section">
            <p className="muted">Оборудование не найдено.</p>
            <button
              type="button"
              className="admin-back-link"
              onClick={() => {
                setEquipmentSubMode("list");
                setEditEquipmentId(null);
              }}
            >
              ← К списку оборудования
            </button>
          </section>
        )}

        {equipmentSubMode === "edit" && editingEquipment && (
          <section className="card admin-section">
            <button
              type="button"
              className="admin-back-link"
              onClick={() => {
                setEquipmentSubMode("list");
                setEditEquipmentId(null);
                setErr(null);
              }}
            >
              ← К списку оборудования
            </button>
            <h2 className="admin-subh">Редактирование: {editingEquipment.name}</h2>
            <div className="admin-form">
              <label>
                Название
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label>
                Тип
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as EquipmentKindOption)}
                >
                  {EQUIPMENT_KIND_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Серийный номер
                <input value={editSerial} onChange={(e) => setEditSerial(e.target.value)} />
              </label>
              <label>
                Статус
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="online">online</option>
                  <option value="offline">offline</option>
                  <option value="on">on</option>
                  <option value="maintenance">maintenance</option>
                  <option value="error">error</option>
                </select>
              </label>
              <label>
                Локация
                <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
              </label>
              <label className="full">
                Примечания
                <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </label>
              <label className="full">
                Характеристики (Параметр=Значение|Ед)
                <textarea rows={4} value={editChars} onChange={(e) => setEditChars(e.target.value)} />
              </label>
              {isPuMachineType(editType) && (
                <div className="full">
                  <CncCycleBuilder
                    steps={editCycleSteps}
                    setSteps={setEditCycleSteps}
                    statusDraft={editCycleStateDraft}
                    setStatusDraft={setEditCycleStateDraft}
                    minutesDraft={editCycleMinutesDraft}
                    setMinutesDraft={setEditCycleMinutesDraft}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    setErr(null);
                    const oldName = editingEquipment.name;
                    await patchEquipment(editingEquipment.id, {
                      name: editName,
                      equipment_type: editType || null,
                      serial_number: editSerial || null,
                      status: editStatus,
                      location: editLocation || null,
                      notes: editNotes || null,
                    });
                    await replaceCharacteristics(editingEquipment.id, parseCharacteristics(editChars));
                    if (isPuMachineType(editType)) {
                      if (oldName.trim() !== editName.trim()) {
                        moveCncScenarioName(oldName, editName);
                      }
                      setCncScenarioByName(editName, normalizeCycleDraft(editCycleSteps));
                    } else {
                      setCncScenarioByName(oldName, []);
                      if (oldName.trim() !== editName.trim()) {
                        setCncScenarioByName(editName, []);
                      }
                    }
                    setMsg(`Оборудование обновлено: ${editName}`);
                    await reload();
                  } catch (ex) {
                    setErr((ex as Error).message);
                  }
                }}
              >
                Сохранить изменения
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (panel === "charts") {
    return (
      <div className="admin-page">
        <div className="page-head admin-subhead">
          <button type="button" className="admin-back-link" onClick={() => setPanel("hub")}>
            ← К администрированию
          </button>
          <h1>Настройка диаграмм</h1>
          <p className="muted small">
            Цвет выбирается из палитры и сохраняется локально (для всех пользователей этого браузера).
            Толщина внутренней обводки: 0 — без обводки.
          </p>
        </div>
        {err && (
          <div className="card error">
            <p>{err}</p>
          </div>
        )}
        {msg && (
          <div className="card">
            <p>{msg}</p>
          </div>
        )}

        <section className="card admin-section">
          <AdminChartPreview colors={chartColors} />
          <div className="admin-form admin-chart-palette-wrap">
            {(Object.keys(CHART_COLOR_KEYS) as MachineState[]).map((st) => (
              <div key={st} className="admin-palette-row">
                <span className="admin-palette-label">{COLOR_STATE_LABEL[st]}</span>
                <div className="admin-palette-swatches">
                  {CHART_PALETTE.map((hex) => (
                    <button
                      key={`${st}-${hex}`}
                      type="button"
                      className={`admin-palette-swatch ${chartColors[st]?.toLowerCase() === hex.toLowerCase() ? "admin-palette-swatch--on" : ""}`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                      aria-label={`${COLOR_STATE_LABEL[st]}: ${hex}`}
                      onClick={() => {
                        setChartColors((prev) => ({ ...prev, [st]: hex }));
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <label>
              Толщина обводки (px)
              <input
                value={chartStroke}
                onChange={(e) => setChartStroke(e.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <button
            type="button"
            className="auth-btn"
            onClick={() => {
              try {
                setErr(null);
                for (const st of Object.keys(CHART_COLOR_KEYS) as MachineState[]) {
                  const v = chartColors[st]?.trim() ?? "";
                  if (isAllowedChartColor(v)) {
                    localStorage.setItem(CHART_COLOR_KEYS[st], v);
                  } else {
                    localStorage.removeItem(CHART_COLOR_KEYS[st]);
                  }
                }
                const w = Number.parseFloat(chartStroke);
                if (Number.isFinite(w) && w >= 0 && w <= 24) {
                  localStorage.setItem(CHART_WIDTH_KEY, String(w));
                } else {
                  localStorage.removeItem(CHART_WIDTH_KEY);
                }
                notifyChartPrefsChanged();
                setMsg("Параметры диаграмм сохранены.");
              } catch {
                setErr("Не удалось сохранить настройки диаграмм.");
              }
            }}
          >
            Сохранить настройки диаграмм
          </button>
        </section>
      </div>
    );
  }

  if (panel === "user-add") {
    return (
      <div className="admin-page">
        <div className="page-head admin-subhead">
          <button
            type="button"
            className="admin-back-link"
            onClick={() => {
              setPanel("users");
              setErr(null);
            }}
          >
            ← К пользователям
          </button>
          <h1>Новый пользователь</h1>
        </div>
        {err && (
          <div className="card error">
            <p>{err}</p>
          </div>
        )}
        <section className="card admin-section">
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                setErr(null);
                const permissions: Partial<Record<PermissionId, boolean>> = {};
                for (const id of ALL_PERMISSION_IDS) {
                  permissions[id] = accPerms[id];
                }
                addCustomAccount({
                  username: accUser,
                  password: accPass,
                  role: accRole,
                  displayName: accDisplayName || undefined,
                  permissions,
                });
                setMsg(`Пользователь создан: ${accUser}`);
                setAccUser("");
                setAccPass("");
                setAccDisplayName("");
                setAccRefresh((x) => x + 1);
                setPanel("users");
              } catch (ex) {
                setErr((ex as Error).message);
              }
            }}
          >
            <label>
              Логин
              <input value={accUser} onChange={(e) => setAccUser(e.target.value)} required />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={accPass}
                onChange={(e) => setAccPass(e.target.value)}
                required
              />
            </label>
            <label>
              ФИО
              <input value={accDisplayName} onChange={(e) => setAccDisplayName(e.target.value)} />
            </label>
            <label>
              Шаблон роли
              <select value={accRole} onChange={(e) => setAccRole(e.target.value as UserRole)}>
                <option value="user">Обычный пользователь</option>
                <option value="admin">Администратор</option>
                <option value="term">Мастер-Печи / Термист</option>
                <option value="cnc">Мастер-ЧПУ</option>
              </select>
            </label>
            <fieldset className="admin-perm-fieldset">
              <legend>Права доступа</legend>
              <div className="admin-perm-grid">
                {PERMISSION_GROUPS.map((group) => (
                  <section key={group.title} className="admin-perm-group">
                    <h3>{group.title}</h3>
                    {group.ids.map((id) => (
                      <label key={id} className="admin-check admin-check--boxed">
                        <input
                          type="checkbox"
                          checked={accPerms[id] ?? false}
                          onChange={(e) =>
                            setAccPerms((prev) => ({ ...prev, [id]: e.target.checked }))
                          }
                        />
                        <span>{PERM_LABELS[id]}</span>
                      </label>
                    ))}
                  </section>
                ))}
              </div>
            </fieldset>
            <button type="submit">Создать учётную запись</button>
          </form>
        </section>
      </div>
    );
  }

  if (panel === "user-edit" && editTargetUsername) {
    const row = getAccountForEdit(editTargetUsername);
    return (
      <div className="admin-page">
        <div className="page-head admin-subhead">
          <button
            type="button"
            className="admin-back-link"
            onClick={() => {
              setEditTargetUsername(null);
              setPanel("users");
              setErr(null);
            }}
          >
            ← К пользователям
          </button>
          <h1>Пользователь</h1>
        </div>
        {err && (
          <div className="card error">
            <p>{err}</p>
          </div>
        )}
        {!row ? (
          <p className="muted">Запись не найдена.</p>
        ) : row.builtIn ? (
          <section className="card admin-section">
            <p>
              <strong>{row.account.username}</strong>
              {row.account.displayName ? ` (${row.account.displayName})` : ""} —{" "}
              {roleLabel(row.account.role)} (базовая учётная запись, изменение недоступно).
            </p>
          </section>
        ) : (
          <section className="card admin-section">
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  setErr(null);
                  const permissions: Partial<Record<PermissionId, boolean>> = {};
                  for (const id of ALL_PERMISSION_IDS) {
                    permissions[id] = editUserPerms[id];
                  }
                  const oldLogin = editTargetUsername;
                  updateCustomAccount(oldLogin, {
                    newUsername: editUserLogin,
                    password: editUserPass.trim() ? editUserPass : undefined,
                    displayName: editUserDisplay,
                    role: editUserRole,
                    permissions,
                  });
                  syncSessionIfSameUser(oldLogin, editUserLogin);
                  setMsg("Пользователь обновлён.");
                  setEditUserPass("");
                  setAccRefresh((x) => x + 1);
                  setEditTargetUsername(editUserLogin.trim());
                  setPanel("users");
                } catch (ex) {
                  setErr((ex as Error).message);
                }
              }}
            >
              <label>
                Логин
                <input
                  value={editUserLogin}
                  onChange={(e) => setEditUserLogin(e.target.value)}
                  required
                />
              </label>
              <label>
                Новый пароль (оставьте пустым, чтобы не менять)
                <input
                  type="password"
                  value={editUserPass}
                  onChange={(e) => setEditUserPass(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                ФИО
                <input value={editUserDisplay} onChange={(e) => setEditUserDisplay(e.target.value)} />
              </label>
              <label>
                Роль
                <select
                  value={editUserRole}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setEditUserRole(r);
                    setEditUserPerms(defaultPermissionsForRole(r));
                  }}
                >
                  <option value="user">Обычный пользователь</option>
                  <option value="admin">Администратор</option>
                  <option value="term">Мастер-Печи / Термист</option>
                  <option value="cnc">Мастер-ЧПУ</option>
                </select>
              </label>
              <fieldset className="admin-perm-fieldset">
                <legend>Права доступа</legend>
                <div className="admin-perm-grid">
                  {PERMISSION_GROUPS.map((group) => (
                    <section key={group.title} className="admin-perm-group">
                      <h3>{group.title}</h3>
                      {group.ids.map((id) => (
                        <label key={id} className="admin-check admin-check--boxed">
                          <input
                            type="checkbox"
                            checked={editUserPerms[id] ?? false}
                            onChange={(e) =>
                              setEditUserPerms((prev) => ({ ...prev, [id]: e.target.checked }))
                            }
                          />
                          <span>{PERM_LABELS[id]}</span>
                        </label>
                      ))}
                    </section>
                  ))}
                </div>
              </fieldset>
              <button type="submit">Сохранить</button>
            </form>
          </section>
        )}
      </div>
    );
  }

  /* users list */
  return (
    <div className="admin-page">
      <div className="page-head admin-subhead">
        <button type="button" className="admin-back-link" onClick={() => setPanel("hub")}>
          ← К администрированию
        </button>
        <h1>Настройка пользователей</h1>
        <p className="muted small">
          Список учётных записей. Нажмите на имя, чтобы открыть параметры (для созданных вручную —
          полное редактирование).
        </p>
      </div>
      {err && (
        <div className="card error">
          <p>{err}</p>
        </div>
      )}
      {msg && (
        <div className="card">
          <p>{msg}</p>
        </div>
      )}
      <section className="card admin-section">
        <div className="admin-users-toolbar">
          <button
            type="button"
            className="auth-btn"
            onClick={() => {
              setErr(null);
              setAccUser("");
              setAccPass("");
              setAccDisplayName("");
              setAccRole("user");
              setAccPerms(defaultPermissionsForRole("user"));
              setPanel("user-add");
            }}
          >
            Добавить пользователя
          </button>
        </div>
        <div className="table-wrap">
          <table className="table admin-users-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Логин</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {accountsList.map((a) => (
                <tr key={a.username}>
                  <td>
                    <button
                      type="button"
                      className="admin-account-link"
                      onClick={() => {
                        setErr(null);
                        setEditTargetUsername(a.username);
                        setPanel("user-edit");
                      }}
                    >
                      {a.displayName?.trim() || a.username}
                      {a.builtIn ? " · базовая" : ""}
                    </button>
                  </td>
                  <td>{a.username}</td>
                  <td>{roleLabel(a.role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
