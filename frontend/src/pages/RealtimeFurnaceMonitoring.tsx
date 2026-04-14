import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchEquipmentList, type Equipment } from "../api";
import { type UserRole } from "../auth";
import {
  buildFurnaceTempSeries,
  formatTempStatusLabel,
  furnaceStateAt,
  furnaceTemperatureAt,
} from "../realtime/furnaceCycle";
import { getActiveBatchForFurnace } from "../thermo/batches";

function isFurnace(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("печь") || t.includes("furnace");
}

export function RealtimeFurnaceMonitoring({ role }: { role: UserRole }) {
  const noAccess = role === "cnc";
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentList()
      .then((data) => {
        if (!cancelled) setItems(data.filter(isFurnace));
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const furnaces = useMemo(
    () =>
      (items ?? []).map((furnace) => {
        const activeBatch = getActiveBatchForFurnace(furnace.id, now);
        const state = furnaceStateAt(now, furnace.id, Boolean(activeBatch));
        const temp = furnaceTemperatureAt(now, furnace.id);
        const series = buildFurnaceTempSeries(
          furnace.id,
          now - 2 * 60 * 60 * 1000,
          now,
          2 * 60 * 1000,
        ).map((p) => ({
          t: new Date(p.utcMs).toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          temp: p.temp,
        }));
        return {
          ...furnace,
          state,
          temp,
          statusLabel: formatTempStatusLabel(state),
          series,
        };
      }),
    [items, now],
  );

  if (err) {
    return (
      <div className="card error">
        <h2>Не удалось загрузить печи</h2>
        <p>{err}</p>
      </div>
    );
  }
  if (noAccess) {
    return (
      <div className="card">
        <h2>Доступ ограничен</h2>
        <p className="muted">Для вашей роли доступен только мониторинг станков ЧПУ.</p>
      </div>
    );
  }
  if (!items) return <div className="muted">Загрузка…</div>;

  return (
    <div>
      <div className="page-head">
        <h1>Мониторинг печей</h1>
        <p className="muted rt-page-lead">Температура печей от времени в режиме реального времени.</p>
      </div>
      {furnaces.length === 0 ? (
        <div className="card">
          <p className="muted">Печи не найдены.</p>
        </div>
      ) : (
        <div className="thermo-grid">
          {furnaces.map((furnace) => (
            <section key={furnace.id} className="card">
              <div className="thermo-furnace-head">
                <h3>{furnace.name}</h3>
                <span className={`status status-${furnace.state}`}>{furnace.statusLabel}</span>
              </div>
              <p className="muted small">Текущая температура: {furnace.temp} °C</p>
              <div className="thermo-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={furnace.series}>
                    <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                    <YAxis domain={[820, 930]} tick={{ fontSize: 10 }} width={42} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                      labelStyle={{ color: "var(--text)" }}
                      itemStyle={{ color: "var(--text)" }}
                    />
                    <Line type="monotone" dataKey="temp" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
