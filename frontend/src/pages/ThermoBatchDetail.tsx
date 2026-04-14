import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ThermoBatchPrintMenu } from "../components/ThermoBatchPrintMenu";
import { type UserRole } from "../auth";
import { buildFurnaceTempSeries } from "../realtime/furnaceCycle";
import { getBatchEndUtcMs, getThermoBatch, updateThermoBatch } from "../thermo/batches";

function canOpenThermo(role: UserRole): boolean {
  return role === "user" || role === "admin" || role === "term";
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ThermoBatchDetail({ role }: { role: UserRole }) {
  const { batchId } = useParams();
  const id = Number(batchId);
  const [refresh, setRefresh] = useState(0);

  if (!canOpenThermo(role)) return <Navigate to="/" replace />;
  if (!Number.isFinite(id)) return <p className="muted">Некорректный номер садки.</p>;

  const batch = getThermoBatch(id);
  const [durationMinutes, setDurationMinutes] = useState(batch?.durationMinutes ?? "");
  const [routeCardNo, setRouteCardNo] = useState(batch?.routeCardNo ?? "");
  const [partName, setPartName] = useState(batch?.partName ?? "");
  const [quantity, setQuantity] = useState(batch?.quantity ?? "");
  const [operator, setOperator] = useState(batch?.operator ?? "");
  const [foreman, setForeman] = useState(batch?.foreman ?? "");
  const [controller, setController] = useState(batch?.controller ?? "");
  const [operationType, setOperationType] = useState(batch?.operationType ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [sampleStepMin, setSampleStepMin] = useState<1 | 5>(1);
  const [tempSpanDeg, setTempSpanDeg] = useState<10 | 20 | 30 | 40 | 50>(50);
  const chartWheelRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [nowUtc, setNowUtc] = useState(() => Date.now());

  if (!batch) return <p className="muted">Садка не найдена.</p>;

  const endUtc = getBatchEndUtcMs({
    ...batch,
    durationMinutes: durationMinutes || batch.durationMinutes,
  });
  const isRunning = nowUtc < endUtc;
  const graphEndUtc = Math.min(endUtc, nowUtc);
  const setpoint = Number.parseFloat(batch.setpointTemp.replace(",", ".")) || 900;
  const halfSpan = tempSpanDeg / 2;
  const tempDomain: [number, number] = [setpoint - halfSpan, setpoint + halfSpan];
  const tempTicks = useMemo(() => {
    const out: number[] = [];
    const step = Math.max(1, Math.floor(tempSpanDeg / 10));
    for (let t = tempDomain[0]; t <= tempDomain[1]; t += step) out.push(Math.round(t));
    if (900 >= tempDomain[0] && 900 <= tempDomain[1] && !out.includes(900)) out.push(900);
    return out.sort((a, b) => a - b);
  }, [tempDomain, tempSpanDeg]);

  const series = useMemo(
    () =>
      buildFurnaceTempSeries(
        batch.furnaceId,
        batch.startedAtUtcMs,
        graphEndUtc,
        sampleStepMin * 60 * 1000,
      ).map((p) => ({
        ...p,
        setpoint,
      })),
    [batch.furnaceId, batch.startedAtUtcMs, graphEndUtc, sampleStepMin, setpoint, refresh],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowUtc(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const el = chartWheelRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setTempSpanDeg((prev) => {
        const next = event.deltaY < 0 ? prev - 10 : prev + 10;
        if (next < 10) return 10;
        if (next > 50) return 50;
        return next as 10 | 20 | 30 | 40 | 50;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div>
      <div className="breadcrumb no-print">
        <Link to="/thermo">Термообработка</Link>
        <span className="sep">/</span>
        <span>Садка №{batch.batchNo}</span>
      </div>
      {msg && (
        <div className="card no-print">
          <p>{msg}</p>
        </div>
      )}
      <div ref={captureRef} className="batch-detail-capture">
        <h1 className="batch-detail-doc-title">Садка №{batch.batchNo}</h1>
        <div className="batch-detail-layout">
          <section className="card">
            <h2>Данные садки</h2>
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isRunning) return;
                const saved = updateThermoBatch(batch.id, {
                  durationMinutes,
                  routeCardNo,
                  partName,
                  quantity,
                  operator,
                  foreman,
                  controller,
                  operationType,
                });
                if (saved) {
                  setRefresh((x) => x + 1);
                  setMsg("Данные садки обновлены.");
                }
              }}
            >
            <label>
              Длительность садки (минуты)
              <input
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                inputMode="numeric"
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Название операции
              <input
                value={operationType}
                onChange={(e) => setOperationType(e.target.value)}
                placeholder="Как при создании садки"
                disabled={!isRunning}
              />
            </label>
            <label>
              Номер маршрутной карты
              <input
                value={routeCardNo}
                onChange={(e) => setRouteCardNo(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Название детали
              <input
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Количество деталей
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Исполнитель
              <input
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Мастер участка
              <input
                value={foreman}
                onChange={(e) => setForeman(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            <label>
              Контроллёр
              <input
                value={controller}
                onChange={(e) => setController(e.target.value)}
                required
                disabled={!isRunning}
              />
            </label>
            {isRunning && (
              <button type="submit" className="no-print">
                Сохранить
              </button>
            )}
          </form>
        </section>

        <section className="card">
          <div className="batch-chart-card-head">
            <div className="batch-chart-card-head-text">
              <p className="muted batch-detail-line--furnace">
                Печь: {batch.furnaceName} · Начало:{" "}
                {new Date(batch.startedAtUtcMs).toLocaleString("ru-RU")}
              </p>
              <p
                className={
                  operationType.trim()
                    ? "batch-operation-title"
                    : "batch-operation-title batch-operation-title--empty"
                }
              >
                {operationType.trim() ? (
                  <>
                    Название операции: <span className="batch-operation-name">{operationType.trim()}</span>
                  </>
                ) : (
                  <>Название операции: <span className="batch-operation-name">—</span></>
                )}
              </p>
              <p className="muted batch-detail-line--status">
                Статус: <strong>{isRunning ? "Запущена" : "Завершена"}</strong>
              </p>
            </div>
            {!isRunning && <ThermoBatchPrintMenu />}
          </div>
          <h2>График температуры печи</h2>
          <p className="muted small">
            Интервал: {new Date(batch.startedAtUtcMs).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} -{" "}
            {new Date(graphEndUtc).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="chart-scale-controls no-print">
            <div className="rt-zoom-bar">
              <button
                type="button"
                className={sampleStepMin === 1 ? "rt-zoom-btn active" : "rt-zoom-btn"}
                onClick={() => setSampleStepMin(1)}
              >
                1 мин
              </button>
              <button
                type="button"
                className={sampleStepMin === 5 ? "rt-zoom-btn active" : "rt-zoom-btn"}
                onClick={() => setSampleStepMin(5)}
              >
                5 мин
              </button>
            </div>
          </div>
          <div className="thermo-chart-wrap chart-wheel-zone" ref={chartWheelRef}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={series}>
                <XAxis
                  type="number"
                  dataKey="utcMs"
                  domain={[batch.startedAtUtcMs, graphEndUtc]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                  }
                />
                <YAxis
                  domain={tempDomain}
                  ticks={tempTicks}
                  tick={{ fontSize: 10 }}
                  width={52}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v) => [`${v} °C`, "Температура"]}
                  labelFormatter={(v) =>
                    new Date(v).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                  labelStyle={{ color: "var(--text)" }}
                  itemStyle={{ color: "var(--text)" }}
                />
                <Legend
                  formatter={(value) =>
                    value === "temp" ? "Фактическая температура" : "Установленное значение температуры"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  name="temp"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="linear"
                  dataKey="setpoint"
                  name="setpoint"
                  stroke="#79c36a"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {isRunning && (
            <div className="batch-remaining">
              До окончания садки: <strong>{formatRemaining(endUtc - nowUtc)}</strong>
            </div>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
