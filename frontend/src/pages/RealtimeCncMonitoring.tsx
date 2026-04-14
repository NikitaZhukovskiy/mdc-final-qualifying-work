import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEquipmentList, type Equipment } from "../api";
import { canViewEquipmentType, type UserRole } from "../auth";
import { MachineIcon } from "../components/MachineIcon";
import { getChartColor, getChartStrokeWidth } from "../chartPrefs";
import { buildCncSegmentsForWindow } from "../realtime/cncEquipmentBridge";
import { isManualOperatorMachine } from "../realtime/manualOperatorMachine";
import {
  HISTORY_START_UTC_MS,
  MAX_PAN_MS,
  STATE_LABEL,
  TICK_STEP_30MIN,
  TICK_STEP_1MIN,
  TICK_STEP_5MIN,
  VIEWPORT_MS_BY_STEP,
  buildViewportAxisTicks,
  formatMoscowWallClock,
  type MachineState,
} from "../realtime/cycle";

const UP_OPERATORS = ["Иванов И.И.", "Сидоров С.С"] as const;
const IDLE_STARTERS = ["Иванов И.И.", "Сидоров С.С"] as const;
const IDLE_FINISHERS = ["Петров П.П.", "Соколов С.С"] as const;

type HoverInfo = {
  rowKey: string;
  machineId: number;
  machineName: string;
  state: MachineState;
  displayStartUtc: number;
  startUtc: number;
  endUtc: number;
  /** Окончание фазы по сценарию; пока now < этого момента — нет «по …» и не показываем, кто снял простой. */
  logicalEndUtc: number;
  anchorPx: number;
  placeBelow: boolean;
  upStartedBy?: string;
  techStartedBy?: string;
  techFinishedBy?: string;
  equipStartedBy?: string;
  equipFinishedBy?: string;
};

type RenderSeg = {
  key: string;
  state: MachineState;
  widthPct: number;
  displayStartUtc: number;
  startUtc: number;
  endUtc: number;
  logicalEndUtc: number;
};

type RowModel =
  | { key: string; kind: "machine"; machine: Equipment }
  | {
      key: string;
      kind: "status";
      machine: Equipment;
      status: MachineState;
      label: string;
    };

function isCnc(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("чпу") || t.includes("cnc") || t.includes("станок с пу") || t.includes("пу");
}

function trackHeightMod(tickStepMs: number): string {
  if (tickStepMs === TICK_STEP_30MIN) return "rt-gantt-track--z30";
  if (tickStepMs === TICK_STEP_5MIN) return "rt-gantt-track--z5";
  if (tickStepMs === TICK_STEP_1MIN) return "rt-gantt-track--z1";
  return "rt-gantt-track--z5";
}

function actorIndex(machineId: number, segStartUtc: number): 0 | 1 {
  const slot = Math.floor(segStartUtc / (5 * 60 * 1000));
  return ((machineId + slot) % 2) as 0 | 1;
}

function buildHoverInfo(
  rowKey: string,
  placeBelow: boolean,
  machineId: number,
  machineName: string,
  seg: RenderSeg,
  anchorPx: number,
): HoverInfo {
  const idx = actorIndex(machineId, seg.startUtc);
  if (seg.state === "up") {
    return {
      rowKey,
      placeBelow,
      machineId,
      machineName,
      state: seg.state,
      displayStartUtc: seg.displayStartUtc,
      startUtc: seg.startUtc,
      endUtc: seg.endUtc,
      logicalEndUtc: seg.logicalEndUtc,
      anchorPx,
      upStartedBy: UP_OPERATORS[idx],
    };
  }
  if (seg.state === "tech_idle") {
    return {
      rowKey,
      placeBelow,
      machineId,
      machineName,
      state: seg.state,
      displayStartUtc: seg.displayStartUtc,
      startUtc: seg.startUtc,
      endUtc: seg.endUtc,
      logicalEndUtc: seg.logicalEndUtc,
      anchorPx,
      techStartedBy: IDLE_STARTERS[idx],
      techFinishedBy: IDLE_FINISHERS[idx],
    };
  }
  if (seg.state === "equip_idle") {
    return {
      rowKey,
      placeBelow,
      machineId,
      machineName,
      state: seg.state,
      displayStartUtc: seg.displayStartUtc,
      startUtc: seg.startUtc,
      endUtc: seg.endUtc,
      logicalEndUtc: seg.logicalEndUtc,
      anchorPx,
      equipStartedBy: IDLE_STARTERS[idx],
      equipFinishedBy: IDLE_FINISHERS[idx],
    };
  }
  return {
    rowKey,
    placeBelow,
    machineId,
    machineName,
    state: seg.state,
    displayStartUtc: seg.displayStartUtc,
    startUtc: seg.startUtc,
    endUtc: seg.endUtc,
    logicalEndUtc: seg.logicalEndUtc,
    anchorPx,
  };
}

export function RealtimeCncMonitoring({ role }: { role: UserRole }) {
  const noAccess = role === "term";
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tickStepMs, setTickStepMs] = useState(TICK_STEP_5MIN);
  const [panMs, setPanMs] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [expandedMachines, setExpandedMachines] = useState<Record<number, boolean>>({});
  const [chartRev, setChartRev] = useState(0);

  useEffect(() => {
    const h = () => setChartRev((x) => x + 1);
    window.addEventListener("mdc-chart-prefs-changed", h);
    window.addEventListener("mdc-manual-timeline-changed", h);
    return () => {
      window.removeEventListener("mdc-chart-prefs-changed", h);
      window.removeEventListener("mdc-manual-timeline-changed", h);
    };
  }, []);

  const chartColors = useMemo(() => {
    void chartRev;
    const states: MachineState[] = [
      "up",
      "on",
      "off",
      "tech_idle",
      "equip_idle",
      "lunch",
      "service",
      "accident",
    ];
    return Object.fromEntries(states.map((s) => [s, getChartColor(s)])) as Record<
      MachineState,
      string
    >;
  }, [chartRev]);

  const chartOutlineW = useMemo(() => {
    void chartRev;
    return getChartStrokeWidth();
  }, [chartRev]);

  const panRef = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    startPan: 0,
    width: 400,
  });

  const viewportDuration =
    VIEWPORT_MS_BY_STEP[tickStepMs] ?? VIEWPORT_MS_BY_STEP[TICK_STEP_5MIN];
  const maxPanAvailableMs = Math.max(0, Math.min(MAX_PAN_MS, now - HISTORY_START_UTC_MS));
  const effectivePanMs = Math.min(panMs, maxPanAvailableMs);
  const windowEnd = now - effectivePanMs;
  const windowStart = Math.max(HISTORY_START_UTC_MS, windowEnd - viewportDuration);

  const ticks = useMemo(
    () => buildViewportAxisTicks(windowStart, windowEnd, tickStepMs),
    [windowStart, windowEnd, tickStepMs],
  );
  const segmentsByMachine = useMemo(() => {
    const out = new Map<number, RenderSeg[]>();
    if (!items) return out;
    for (const machine of items) {
      const segs = buildCncSegmentsForWindow(windowStart, windowEnd, machine, now);
      const reversed = [...segs].reverse();
      out.set(
        machine.id,
        reversed.map((seg, i) => ({
          key: `${machine.id}-${i}-${seg.startUtc}-${seg.endUtc}-${seg.state}`,
          state: seg.state,
          displayStartUtc: seg.effectiveStartUtc,
          startUtc: seg.startUtc,
          endUtc: seg.endUtc,
          logicalEndUtc: seg.logicalEndUtc,
          widthPct: ((seg.endUtc - seg.startUtc) / (windowEnd - windowStart)) * 100,
        })),
      );
    }
    return out;
  }, [items, now, windowEnd, windowStart]);

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentList()
      .then((data) => {
        if (!cancelled) {
          setItems(
            data.filter(
              (e) =>
                isCnc(e) &&
                canViewEquipmentType(role, e.equipment_type) &&
                !isManualOperatorMachine(e),
            ),
          );
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    const idTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(idTimer);
  }, []);

  useEffect(() => {
    const maxPanByWindow = Math.max(0, maxPanAvailableMs - viewportDuration);
    if (panMs > maxPanByWindow) setPanMs(maxPanByWindow);
  }, [panMs, maxPanAvailableMs, viewportDuration]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      const w = el.getBoundingClientRect().width;
      panRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startPan: panMs,
        width: Math.max(1, w),
      };
      el.setPointerCapture(e.pointerId);
    },
    [panMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panRef.current.active || e.pointerId !== panRef.current.pointerId) return;
      const dx = e.clientX - panRef.current.startX;
      const deltaMs = (dx / panRef.current.width) * viewportDuration;
      const maxPanByWindow = Math.max(0, maxPanAvailableMs - viewportDuration);
      const next = Math.max(0, Math.min(maxPanByWindow, panRef.current.startPan + deltaMs));
      setPanMs(next);
    },
    [maxPanAvailableMs, viewportDuration],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerId !== panRef.current.pointerId) return;
    panRef.current.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const rows = useMemo<RowModel[]>(() => {
    if (!items) return [];
    const out: RowModel[] = [];
    for (const machine of items) {
      out.push({ key: `m:${machine.id}`, kind: "machine", machine });
      if (expandedMachines[machine.id]) {
        out.push({ key: `s:${machine.id}:on`, kind: "status", machine, status: "on", label: "Включен" });
        out.push({ key: `s:${machine.id}:off`, kind: "status", machine, status: "off", label: "Выключен" });
        out.push({ key: `s:${machine.id}:up`, kind: "status", machine, status: "up", label: "Работа по УП" });
        out.push({ key: `s:${machine.id}:tech`, kind: "status", machine, status: "tech_idle", label: "Технический простой" });
        out.push({ key: `s:${machine.id}:equip`, kind: "status", machine, status: "equip_idle", label: "Простой оборудования" });
        out.push({ key: `s:${machine.id}:lunch`, kind: "status", machine, status: "lunch", label: "Обед" });
        out.push({ key: `s:${machine.id}:service`, kind: "status", machine, status: "service", label: "Обслуживание оборудования" });
        out.push({ key: `s:${machine.id}:accident`, kind: "status", machine, status: "accident", label: "Авария" });
      }
    }
    return out;
  }, [expandedMachines, items]);

  const toggleMachine = useCallback((machineId: number) => {
    setExpandedMachines((prev) => ({ ...prev, [machineId]: !prev[machineId] }));
  }, []);

  const dur = windowEnd - windowStart;
  const trackMod = trackHeightMod(tickStepMs);
  const renderSegmentsForMachine = useCallback(
    (machineId: number) => segmentsByMachine.get(machineId) ?? [],
    [segmentsByMachine],
  );

  const onSegEnter = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      rowKey: string,
      rowIndex: number,
      machine: Equipment,
      seg: RenderSeg,
    ) => {
      const segRect = e.currentTarget.getBoundingClientRect();
      const rowEl = e.currentTarget.closest(".rt-gantt-track-cell") as HTMLElement | null;
      const rowRect = rowEl?.getBoundingClientRect();
      const anchorPx = rowRect ? segRect.left - rowRect.left + segRect.width / 2 : segRect.width / 2;
      setHoverInfo(
        buildHoverInfo(rowKey, rowIndex <= 1, machine.id, machine.name, seg, anchorPx),
      );
    },
    [],
  );

  if (err) {
    return (
      <div className="card error">
        <h2>Не удалось загрузить станки</h2>
        <p>{err}</p>
      </div>
    );
  }
  if (noAccess) {
    return (
      <div className="card">
        <h2>Доступ ограничен</h2>
        <p className="muted">Для вашей роли доступен только мониторинг печей.</p>
      </div>
    );
  }
  if (!items) return <div className="muted">Загрузка…</div>;

  return (
    <div className="rt-page">
      <div className="page-head">
        <h1>Мониторинг станков ЧПУ</h1>
        <p className="muted rt-page-lead">Текущее состояние и ход работы станков в реальном времени.</p>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="muted">Нет станков ЧПУ в каталоге.</p>
        </div>
      ) : (
        <div className="rt-gantt-panel">
          <div className="rt-gantt-grid">
            <div className="rt-gantt-zoom-cell">
              <div className="rt-zoom-bar" role="group" aria-label="Масштаб шкалы времени">
                <button
                  type="button"
                  className={tickStepMs === TICK_STEP_30MIN ? "rt-zoom-btn active" : "rt-zoom-btn"}
                  onClick={() => setTickStepMs(TICK_STEP_30MIN)}
                >
                  30 мин
                </button>
                <button
                  type="button"
                  className={tickStepMs === TICK_STEP_5MIN ? "rt-zoom-btn active" : "rt-zoom-btn"}
                  onClick={() => setTickStepMs(TICK_STEP_5MIN)}
                >
                  5 мин
                </button>
                <button
                  type="button"
                  className={tickStepMs === TICK_STEP_1MIN ? "rt-zoom-btn active" : "rt-zoom-btn"}
                  onClick={() => setTickStepMs(TICK_STEP_1MIN)}
                >
                  1 мин
                </button>
              </div>
            </div>
            <div
              className="rt-gantt-axis-cell rt-pannable"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="presentation"
            >
              <div className="rt-axis-inner">
                <svg className="rt-axis-svg" viewBox="0 0 1000 22" preserveAspectRatio="none" aria-hidden>
                  {ticks.map((tk) => {
                    const x = Math.min(1000, Math.max(0, ((tk.utcMs - windowStart) / dur) * 1000));
                    return (
                      <line
                        key={tk.utcMs}
                        x1={x}
                        x2={x}
                        y1={tk.isMajor ? 2 : 11}
                        y2="20"
                        className={tk.isMajor ? "rt-axis-line rt-axis-line--major" : "rt-axis-line rt-axis-line--minor"}
                        vectorEffect="nonScalingStroke"
                      />
                    );
                  })}
                </svg>
                <div className="rt-axis-labels">
                  {ticks.filter((tk) => tk.label).map((tk) => (
                    <div key={tk.utcMs} className="rt-axis-label-tick" style={{ left: `${tk.pct}%` }}>
                      <span className="rt-gantt-tick-label">{tk.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {rows.map((row, rowIndex) => (
              <Fragment key={row.key}>
                <div
                  className={
                    row.kind === "machine" ? "rt-gantt-name-cell" : "rt-gantt-name-cell rt-gantt-name-cell--status"
                  }
                >
                  {row.kind === "machine" ? (
                    <div className="rt-machine-line">
                      <button
                        type="button"
                        className="rt-expand-btn"
                        onClick={() => toggleMachine(row.machine.id)}
                        aria-label={expandedMachines[row.machine.id] ? "Свернуть статусы станка" : "Развернуть статусы станка"}
                      >
                        {expandedMachines[row.machine.id] ? "▾" : "▸"}
                      </button>
                      <span className="rt-gantt-name">
                        <MachineIcon />
                        {row.machine.name}
                      </span>
                    </div>
                  ) : (
                    <span className="rt-substatus-name">{row.label}</span>
                  )}
                </div>
                <div
                  className={
                    row.kind === "machine"
                      ? "rt-gantt-track-cell rt-pannable"
                      : "rt-gantt-track-cell rt-gantt-track-cell--status rt-pannable"
                  }
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  role="presentation"
                >
                  {hoverInfo && hoverInfo.rowKey === row.key && (
                    <div
                      className={hoverInfo.placeBelow ? "rt-hover-card rt-hover-card--under-segment" : "rt-hover-card rt-hover-card--over-segment"}
                      style={{ left: `${hoverInfo.anchorPx}px` }}
                      role="status"
                      aria-live="polite"
                    >
                      <p className="rt-hover-title">{hoverInfo.machineName}</p>
                      <p>
                        Статус <strong>{STATE_LABEL[hoverInfo.state]}</strong>
                      </p>
                      <p>
                        {(() => {
                          const fromText = formatMoscowWallClock(hoverInfo.displayStartUtc, false);
                          const phaseStillRunning = now < hoverInfo.logicalEndUtc;
                          if (phaseStillRunning) {
                            return `с ${fromText}`;
                          }
                          const toText = formatMoscowWallClock(hoverInfo.logicalEndUtc, false);
                          return `с ${fromText} по ${toText}`;
                        })()}
                      </p>
                      {hoverInfo.upStartedBy && <p>УП запустил: {hoverInfo.upStartedBy}</p>}
                      {hoverInfo.techStartedBy && <p>Тех. простой начал: {hoverInfo.techStartedBy}</p>}
                      {hoverInfo.techFinishedBy && now >= hoverInfo.logicalEndUtc && (
                        <p>Тех. простой снял: {hoverInfo.techFinishedBy}</p>
                      )}
                      {hoverInfo.equipStartedBy && <p>Простой оборудования начал: {hoverInfo.equipStartedBy}</p>}
                      {hoverInfo.equipFinishedBy && now >= hoverInfo.logicalEndUtc && (
                        <p>Простой оборудования снял: {hoverInfo.equipFinishedBy}</p>
                      )}
                    </div>
                  )}

                  <div
                    className={`rt-gantt-track rt-gantt-track--rtl ${trackMod}`}
                    role="img"
                    aria-label={`${row.machine.name}: настоящее время у правого края, история слева`}
                  >
                    {renderSegmentsForMachine(row.machine.id).map((seg) => {
                      const isEmpty =
                        row.kind === "status"
                          ? row.status === "on"
                            ? seg.state === "off"
                            : seg.state !== row.status
                          : false;
                      const fillState: MachineState =
                        row.kind === "status" && row.status === "on" ? "on" : seg.state;
                      const fill = isEmpty ? undefined : chartColors[fillState];
                      return (
                        <div
                          key={`${row.machine.id}-${row.key}-${seg.key}`}
                          className={isEmpty ? "rt-seg rt-seg--empty" : "rt-seg"}
                          onMouseEnter={
                            isEmpty
                              ? undefined
                              : (e) => onSegEnter(e, row.key, rowIndex, row.machine, seg)
                          }
                          onMouseLeave={isEmpty ? undefined : () => setHoverInfo(null)}
                          style={{
                            width: `${seg.widthPct}%`,
                            ...(fill
                              ? {
                                  backgroundColor: fill,
                                  boxShadow:
                                    chartOutlineW > 0
                                      ? `inset 0 0 0 ${chartOutlineW}px rgba(255,255,255,0.14)`
                                      : undefined,
                                }
                              : {}),
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
