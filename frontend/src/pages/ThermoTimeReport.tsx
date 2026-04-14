import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Brush } from "recharts";
import { fetchEquipmentList, type Equipment } from "../api";
import { getSession, hasPermission } from "../auth";
import { ThermoBatchPrintMenu } from "../components/ThermoBatchPrintMenu";
import { buildFurnaceTempSeries } from "../realtime/furnaceCycle";

type Row = { utcMs: number; temp: number; setpoint: number };

function isFurnace(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("печь") || t.includes("furnace");
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${m}`;
}

function parseDatetimeLocalValue(v: string): number | null {
  if (!v.trim()) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pickStepMs(spanMs: number, preferred: number): number {
  const minStep = 60_000;
  const targetPoints = 2400;
  const adaptive = Math.max(minStep, Math.ceil(spanMs / targetPoints / minStep) * minStep);
  return Math.max(preferred, adaptive);
}

export function ThermoTimeReport() {
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [furnaceId, setFurnaceId] = useState<number | null>(null);
  const now = Date.now();
  const [fromV, setFromV] = useState(() => toDatetimeLocalValue(now - 8 * 60 * 60 * 1000));
  const [toV, setToV] = useState(() => toDatetimeLocalValue(now));
  const [stepMin, setStepMin] = useState(5);
  const [tempSpanDeg, setTempSpanDeg] = useState<10 | 20 | 30 | 40 | 50>(50);
  const chartWheelRef = useRef<HTMLDivElement | null>(null);
  const [generated, setGenerated] = useState<{ rows: Row[]; furnaceName: string; fromMs: number; toMs: number } | null>(null);
  const canCreate = hasPermission(getSession(), "report_thermo_create");

  useEffect(() => {
    fetchEquipmentList()
      .then((data) => {
        const furnaces = data.filter(isFurnace);
        setItems(furnaces);
        if (furnaces.length > 0) setFurnaceId(furnaces[0].id);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const selectedFurnace = useMemo(
    () => (items ?? []).find((x) => x.id === furnaceId) ?? null,
    [items, furnaceId],
  );

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

  const onGenerate = () => {
    if (!canCreate) {
      setErr("Недостаточно прав для создания отчетов по печам.");
      return;
    }
    if (!selectedFurnace) return;
    const fromMs = parseDatetimeLocalValue(fromV);
    const toMs = parseDatetimeLocalValue(toV);
    if (fromMs == null || toMs == null || toMs <= fromMs) {
      setErr("Проверьте период: время окончания должно быть позже времени начала.");
      return;
    }
    setErr(null);
    const span = toMs - fromMs;
    const step = pickStepMs(span, Math.max(1, stepMin) * 60 * 1000);
    const rows = buildFurnaceTempSeries(selectedFurnace.id, fromMs, toMs, step).map((x) => ({
      utcMs: x.utcMs,
      temp: x.temp,
      setpoint: 900,
    }));
    setGenerated({
      rows,
      furnaceName: selectedFurnace.name,
      fromMs,
      toMs,
    });
  };

  const tempDomain: [number, number] = useMemo(() => {
    const center = 900;
    const half = tempSpanDeg / 2;
    return [center - half, center + half];
  }, [tempSpanDeg]);

  const tempTicks = useMemo(() => {
    const out: number[] = [];
    const step = Math.max(1, Math.floor(tempSpanDeg / 10));
    for (let t = tempDomain[0]; t <= tempDomain[1]; t += step) out.push(Math.round(t));
    if (900 >= tempDomain[0] && 900 <= tempDomain[1] && !out.includes(900)) out.push(900);
    return out.sort((a, b) => a - b);
  }, [tempDomain, tempSpanDeg]);

  return (
    <div>
      <div className="breadcrumb no-print">
        <Link to="/reports">Отчеты</Link>
        <span className="sep">/</span>
        <Link to="/reports/thermo">Термообработка</Link>
        <span className="sep">/</span>
        <span>Отчет по времени</span>
      </div>

      <div className="page-head">
        <h1>Отчет по времени</h1>
        <p className="muted">Выберите печь и период, затем сформируйте отчет.</p>
        {!canCreate && (
          <p className="muted small">Для вашей роли доступен просмотр, но создание отчета отключено.</p>
        )}
      </div>

      {err && (
        <div className="card error">
          <p>{err}</p>
        </div>
      )}

      <section className="card no-print">
        {items == null ? (
          <p className="muted">Загрузка печей…</p>
        ) : items.length === 0 ? (
          <p className="muted">Печи не найдены.</p>
        ) : (
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              onGenerate();
            }}
          >
            <label>
              Печь
              <select
                value={furnaceId ?? ""}
                onChange={(e) => setFurnaceId(Number(e.target.value))}
                required
              >
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дата и время начала
              <input type="datetime-local" value={fromV} onChange={(e) => setFromV(e.target.value)} required />
            </label>
            <label>
              Дата и время окончания
              <input type="datetime-local" value={toV} onChange={(e) => setToV(e.target.value)} required />
            </label>
            <label>
              Шаг выборки (мин)
              <select value={stepMin} onChange={(e) => setStepMin(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={5}>5</option>
                <option value={15}>15</option>
                <option value={60}>60</option>
              </select>
            </label>
            <div className="full">
              <button type="submit" disabled={!canCreate}>Создать</button>
            </div>
          </form>
        )}
      </section>

      {generated && (
        <section className="card report-time-chart-only">
          <div className="batch-chart-card-head">
            <div className="batch-chart-card-head-text">
              <h2>Диаграмма температуры</h2>
              <p className="muted small">
                Печь: {generated.furnaceName} · {new Date(generated.fromMs).toLocaleString("ru-RU")} —{" "}
                {new Date(generated.toMs).toLocaleString("ru-RU")}
              </p>
            </div>
            <ThermoBatchPrintMenu />
          </div>
          <div className="thermo-chart-wrap report-time-chart chart-wheel-zone" ref={chartWheelRef}>
            <ResponsiveContainer width="100%" height={560}>
              <LineChart data={generated.rows}>
                <XAxis
                  type="number"
                  dataKey="utcMs"
                  domain={[generated.fromMs, generated.toMs]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis
                  domain={tempDomain}
                  ticks={tempTicks}
                  tick={{ fontSize: 10 }}
                  width={56}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v) => [`${v} °C`, "Температура"]}
                  labelFormatter={(v) => new Date(v).toLocaleString("ru-RU")}
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
                    value === "temp"
                      ? "Фактическая температура"
                      : "Установленное значение температуры"
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
                <Brush
                  dataKey="utcMs"
                  height={24}
                  travellerWidth={8}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
