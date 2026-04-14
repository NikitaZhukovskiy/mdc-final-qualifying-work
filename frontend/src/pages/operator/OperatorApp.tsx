import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEquipmentList, type Equipment } from "../../api";
import type { SessionUser } from "../../auth";
import { UserAvatar } from "../../components/UserAvatar";
import { STATE_LABEL, type MachineState } from "../../realtime/cycle";
import {
  clearManualReasonToUp,
  commitManualBaseState,
  commitManualIdleReason,
  formatShiftRangeLabel,
  getOpenSegmentState,
  listDowntimePeriodsInCurrentShift,
  replaceIdleRangeWithReason,
} from "../../realtime/manualCncTimeline";
import { getOperatorSimulatedMetrics } from "../../realtime/operatorSimulatedMetrics";
import { isManualOperatorMachine } from "../../realtime/manualOperatorMachine";

type Phase = "select" | "work";
type OperatorTheme = "dark" | "light";
type RightTab = "status" | "reasons" | "downtimes";

const REASONS: { id: "lunch" | "service" | "accident"; label: string }[] = [
  { id: "lunch", label: "Обед" },
  { id: "service", label: "Обслуживание оборудования" },
  { id: "accident", label: "Авария" },
];

const BASE_OPTIONS: { id: MachineState; label: string }[] = [
  { id: "up", label: "Работа по УП" },
  { id: "off", label: "Выключен" },
];

const THEME_KEY = "mdc-operator-theme";

function ThemeGlyph({ theme }: { theme: OperatorTheme }) {
  if (theme === "light") {
    return (
      <svg className="operator-theme-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="4.1" fill="currentColor" opacity="0.9" />
        <path
          fill="currentColor"
          d="M12 1.4l2.2 4.4h-4.4zm9.6 10.6l-4.4 2.2v-4.4zm-10.6 9.6l4.4-2.2v4.4zm-9.6-10.6l4.4-2.2v4.4z"
          opacity="0.6"
        />
      </svg>
    );
  }
  return (
    <svg className="operator-theme-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M15.5 2.5c-3.5.5-6.3 3.6-6.3 7.3 0 4 3.3 7.3 7.4 7.3 1.3 0 2.6-.3 3.7-.9-1.3 3.1-4.4 5.3-8 5.3-4.8 0-8.7-3.9-8.7-8.7 0-4.9 3.9-8.8 8.8-8.8 1.2 0 2.2.2 3.1.5Z"
      />
    </svg>
  );
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function OperatorApp({
  session,
  onLogout,
}: {
  session: SessionUser;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [hadWorkSession, setHadWorkSession] = useState(false);
  const [tick, setTick] = useState(0);
  const [draftBase, setDraftBase] = useState<MachineState>("up");
  const [pickedReason, setPickedReason] = useState<"lunch" | "service" | "accident" | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("status");
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState<OperatorTheme>(() => {
    const s = localStorage.getItem(THEME_KEY);
    return s === "light" ? "light" : "dark";
  });
  const [periodReasonChoice, setPeriodReasonChoice] = useState<Record<string, "lunch" | "service" | "accident">>(
    {},
  );
  const profileRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentList()
      .then((data) => {
        if (!cancelled) setItems(data.filter(isManualOperatorMachine));
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!profileRef.current?.contains(t)) setProfileOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, []);

  const machine = useMemo(() => items?.[0] ?? null, [items]);

  useEffect(() => {
    if (machine && items?.length === 1) setSelected(machine);
  }, [machine, items?.length]);

  const now = useMemo(() => Date.now(), [tick]);

  const openSeg = useMemo(() => {
    if (!selected) return null;
    return getOpenSegmentState(selected.id, now);
  }, [selected, now]);

  const live = useMemo(() => {
    if (!selected) return null;
    return getOperatorSimulatedMetrics(selected.id, now);
  }, [selected, now]);

  const currentState: MachineState | null = openSeg?.state ?? null;

  const canPickReason =
    openSeg && (openSeg.state === "tech_idle" || openSeg.state === "equip_idle");
  const inTypedReason =
    openSeg &&
    (openSeg.state === "lunch" || openSeg.state === "service" || openSeg.state === "accident");

  useEffect(() => {
    if (inTypedReason) setRightTab("reasons");
  }, [inTypedReason]);

  const downtimes = useMemo(() => {
    if (!selected) return [];
    return listDowntimePeriodsInCurrentShift(selected.id, now);
  }, [selected, now, tick]);

  const baseSheetWasHiddenRef = useRef(false);
  useEffect(() => {
    const hidden = Boolean(canPickReason || inTypedReason);
    if (hidden) {
      baseSheetWasHiddenRef.current = true;
      return;
    }
    if (
      baseSheetWasHiddenRef.current &&
      openSeg &&
      (openSeg.state === "up" || openSeg.state === "off")
    ) {
      baseSheetWasHiddenRef.current = false;
      setDraftBase(openSeg.state);
    }
  }, [canPickReason, inTypedReason, openSeg]);

  const primaryAction = () => {
    if (!selected) return;
    if (inTypedReason && pickedReason === openSeg?.state) {
      clearManualReasonToUp(selected.id);
      setPickedReason(null);
      refresh();
      return;
    }
    if (canPickReason && (draftBase === "up" || draftBase === "off")) {
      commitManualBaseState(selected.id, draftBase);
      setPickedReason(null);
      refresh();
      return;
    }
    if (canPickReason && pickedReason) {
      commitManualIdleReason(selected.id, pickedReason);
      setPickedReason(null);
      refresh();
      return;
    }
    commitManualBaseState(selected.id, draftBase);
    setPickedReason(null);
    refresh();
  };

  const primaryLabel = (() => {
    if (inTypedReason && pickedReason === openSeg?.state) return "Снять";
    if (canPickReason && pickedReason) return "Подтвердить";
    return "Подтвердить";
  })();

  const primaryDisabled = (() => {
    if (!selected) return true;
    if (inTypedReason) return pickedReason !== openSeg?.state;
    if (canPickReason) {
      if (draftBase === "up" || draftBase === "off") return false;
      return !pickedReason;
    }
    if (openSeg && (draftBase === "up" || draftBase === "off") && openSeg.state === draftBase) {
      return true;
    }
    return false;
  })();

  if (err) {
    return (
      <div className="operator-shell" data-theme={theme}>
        <div className="card error operator-error">
          <p>{err}</p>
        </div>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="operator-shell" data-theme={theme}>
        <p className="muted operator-loading">Загрузка…</p>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="operator-shell" data-theme={theme}>
        <p className="muted">Станок для пульта оператора не найден в каталоге.</p>
        <button type="button" className="auth-btn" onClick={onLogout}>
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div className="operator-shell" data-theme={theme}>
      <header className="operator-top-bar">
        <div className="operator-top-left">
          {phase === "work" ? (
            <button
              type="button"
              className="operator-back-btn"
              onClick={() => {
                setPhase("select");
              }}
            >
              Назад
            </button>
          ) : (
            <span className="operator-brand-mark">NEXA · Пульт</span>
          )}
        </div>
        <h1 className="operator-header-title">
          {phase === "work" ? machine.name : "Выбор станка"}
        </h1>
        <div className="operator-top-right" ref={profileRef}>
          <button
            type="button"
            className="operator-theme-btn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "light" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "light" ? "Светлая тема" : "Тёмная тема"}
          >
            <ThemeGlyph theme={theme} />
          </button>
          <button
            type="button"
            className="operator-user-btn"
            aria-label="Профиль"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((o) => !o)}
          >
            <UserAvatar />
          </button>
          {profileOpen && (
            <div className="operator-profile-popover">
              <p className="operator-profile-name">{session.displayName}</p>
              <button type="button" className="operator-profile-logout" onClick={onLogout}>
                Выйти из сессии
              </button>
            </div>
          )}
        </div>
      </header>

      {phase === "select" ? (
        <div className="operator-main operator-main--select">
          <button
            type="button"
            className={`operator-machine-tile ${selected?.id === machine.id ? "operator-machine-tile--selected" : ""}`}
            onClick={() => setSelected(machine)}
          >
            <span className="operator-machine-tile-name">{machine.name}</span>
            <span className="muted small">Паспорт VF-2 · ручные статусы</span>
          </button>
          <div className="operator-bottom-bar operator-bottom-bar--select">
            {hadWorkSession ? (
              <button
                type="button"
                className="auth-btn operator-confirm-btn"
                disabled={!selected}
                onClick={() => {
                  setPhase("select");
                  setHadWorkSession(false);
                }}
              >
                Закончить работу
              </button>
            ) : selected ? (
              <button
                type="button"
                className="auth-btn operator-confirm-btn operator-confirm-btn--primary"
                onClick={() => {
                  setHadWorkSession(true);
                  const st = getOpenSegmentState(machine.id, Date.now())?.state;
                  setDraftBase(st === "off" ? "off" : "up");
                  setPhase("work");
                  setRightTab("status");
                }}
              >
                Начать работу
              </button>
            ) : (
              <button type="button" className="auth-btn operator-confirm-btn" disabled>
                Начать работу
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="operator-main operator-work-layout">
          <section className="operator-panel operator-panel--left operator-glass">
            <div className="operator-panel-head">
              <h2 className="operator-panel-title">Станок</h2>
              {currentState && (
                <span className="operator-status-pill">{STATE_LABEL[currentState]}</span>
              )}
            </div>
            <p className="muted small operator-metrics-hint">
              Показатели обновляются по данным с контроллера (имитация при работе по УП).
            </p>
            <dl className="operator-metrics-dl">
              <div className="operator-metric-cell">
                <dt>Выполнение УП</dt>
                <dd>{live ? `${live.programPct.toFixed(1)} %` : "—"}</dd>
              </div>
              <div className="operator-metric-cell">
                <dt>Шпиндель</dt>
                <dd>{live ? `${Math.round(live.spindleRpm)} об/мин` : "—"}</dd>
              </div>
              <div className="operator-metric-cell operator-metric-cell--wide">
                <dt>Рабочий ход (X/Y/Z)</dt>
                <dd>{live?.travel ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="operator-panel operator-panel--right operator-glass">
            <div className="operator-operator-card">
              <div className="operator-operator-row">
                <span className="operator-operator-avatar" aria-hidden>
                  <UserAvatar />
                </span>
                <div>
                  <p className="muted small operator-label-upper">Оператор</p>
                  <p className="operator-fio">{session.displayName}</p>
                </div>
              </div>
            </div>

            <div className="operator-tabs operator-tabs--three" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "status"}
                className={`operator-tab ${rightTab === "status" ? "operator-tab--active" : ""}`}
                onClick={() => setRightTab("status")}
              >
                Статус
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "reasons"}
                className={`operator-tab ${rightTab === "reasons" ? "operator-tab--active" : ""}`}
                onClick={() => setRightTab("reasons")}
              >
                Причины простоя
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "downtimes"}
                className={`operator-tab ${rightTab === "downtimes" ? "operator-tab--active" : ""}`}
                onClick={() => setRightTab("downtimes")}
              >
                Простои
              </button>
            </div>

            <div className="operator-tab-body">
              {rightTab === "status" && (
                <div className="operator-tab-panel">
                  <div className="operator-base-grid">
                    {BASE_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`operator-chip ${draftBase === o.id ? "operator-chip--active" : ""}`}
                        onClick={() => setDraftBase(o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {(canPickReason || inTypedReason) && (
                    <p className="muted small operator-tab-hint">
                      При простое можно сначала указать причину на другой вкладке либо принудительно включить УП
                      или выключить станок.
                    </p>
                  )}
                </div>
              )}

              {rightTab === "reasons" && (
                <div className="operator-tab-panel">
                  {canPickReason && (
                    <p className="operator-hint muted small">
                      Укажите причину и подтвердите внизу (или на вкладке «Статус» включите УП без причины).
                    </p>
                  )}
                  {inTypedReason && (
                    <p className="operator-hint muted small">
                      Нажмите на активную причину и «Снять», чтобы вернуться к работе по УП.
                    </p>
                  )}
                  <div className="operator-reason-grid">
                    {REASONS.map((r) => {
                      const active = openSeg?.state === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`operator-chip ${pickedReason === r.id ? "operator-chip--picked" : ""} ${active ? "operator-chip--active" : ""}`}
                          onClick={() => setPickedReason((p) => (p === r.id ? null : r.id))}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {rightTab === "downtimes" && selected && (
                <div className="operator-tab-panel operator-downtimes-panel">
                  <p className="muted small operator-downtimes-shift">
                    Текущая смена ({formatShiftRangeLabel(now)}). Редактирование только периодов этой смены.
                  </p>
                  {downtimes.length === 0 ? (
                    <p className="muted small">Простоев в смене пока нет.</p>
                  ) : (
                    <ul className="operator-downtime-list">
                      {downtimes.map((row) => {
                        const k = `${row.startUtc}-${row.endUtc}`;
                        const choice = periodReasonChoice[k] ?? "lunch";
                        return (
                          <li key={k} className="operator-downtime-item">
                            <div className="operator-downtime-times">
                              <span>{formatClock(row.startUtc)}</span>
                              <span className="operator-downtime-sep">—</span>
                              <span>{formatClock(row.endUtc)}</span>
                            </div>
                            <div className="operator-downtime-state">{STATE_LABEL[row.state]}</div>
                            {row.canAssignReason ? (
                              <div className="operator-downtime-assign">
                                <select
                                  className="operator-downtime-select"
                                  value={choice}
                                  onChange={(e) =>
                                    setPeriodReasonChoice((prev) => ({
                                      ...prev,
                                      [k]: e.target.value as "lunch" | "service" | "accident",
                                    }))
                                  }
                                >
                                  {REASONS.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="operator-downtime-apply"
                                  onClick={() => {
                                    if (
                                      replaceIdleRangeWithReason(
                                        selected.id,
                                        row.startUtc,
                                        row.endUtc,
                                        choice,
                                        Date.now(),
                                      )
                                    ) {
                                      refresh();
                                    }
                                  }}
                                >
                                  Применить
                                </button>
                              </div>
                            ) : (
                              <span className="muted small operator-downtime-locked">Причина указана</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="operator-bottom-bar operator-bottom-bar--work">
              <button
                type="button"
                className="auth-btn operator-confirm-btn operator-confirm-btn--primary"
                onClick={primaryAction}
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
