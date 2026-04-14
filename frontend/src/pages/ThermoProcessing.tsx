import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchEquipmentList, type Equipment } from "../api";
import { hasPermission, type SessionUser } from "../auth";
import {
  buildFurnaceTempSeries,
  formatTempStatusLabel,
  furnaceStateAt,
  furnaceTemperatureAt,
} from "../realtime/furnaceCycle";
import type { ThermoBatch } from "../thermo/batches";
import { getActiveBatchForFurnace, getBatchEndUtcMs, listThermoBatches } from "../thermo/batches";

function batchMatchesSearch(b: ThermoBatch, q: string, now: number): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const running = now < getBatchEndUtcMs(b);
  const status = running ? "запущена" : "завершена";
  const blob = [
    b.furnaceName,
    String(b.batchNo),
    status,
    b.operationType ?? "",
    b.routeCardNo ?? "",
    b.operator ?? "",
    b.partName ?? "",
    b.quantity ?? "",
    b.foreman ?? "",
    b.controller ?? "",
    b.durationMinutes ?? "",
    b.setpointTemp ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(t);
}

function isFurnace(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("печь") || t.includes("furnace");
}

function canOpenThermo(session: SessionUser): boolean {
  return (
    hasPermission(session, "nav_thermo") &&
    (session.role === "user" || session.role === "admin" || session.role === "term")
  );
}

export function ThermoProcessing({ session }: { session: SessionUser }) {
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const [batchSearch, setBatchSearch] = useState("");

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
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setRefreshKey((x) => x + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const batches = useMemo(() => listThermoBatches(), [refreshKey]);
  const filteredBatches = useMemo(
    () => batches.filter((b) => batchMatchesSearch(b, batchSearch, now)),
    [batches, batchSearch, now],
  );

  if (!canOpenThermo(session)) {
    return (
      <div className="card">
        <h2>Доступ ограничен</h2>
        <p className="muted">Раздел термообработки доступен для пользователя, термиста и администратора.</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card error">
        <h2>Ошибка загрузки термообработки</h2>
        <p>{err}</p>
      </div>
    );
  }

  if (!items) return <div className="muted">Загрузка…</div>;

  return (
    <div>
      <div className="page-head">
        <h1>Термообработка</h1>
        <p className="muted">Печи, их статус и управление садками.</p>
      </div>

      <section className="card">
        <h2>Печи</h2>
        {items.length === 0 ? (
          <p className="muted">Нет печей в каталоге.</p>
        ) : (
          <div className="thermo-grid">
            {items.map((furnace) => {
              const activeBatch = getActiveBatchForFurnace(furnace.id, now);
              const state = furnaceStateAt(now, furnace.id, Boolean(activeBatch));
              const temp = furnaceTemperatureAt(now, furnace.id);
              const tempSeries = buildFurnaceTempSeries(
                furnace.id,
                now - 2 * 60 * 60 * 1000,
                now,
                3 * 60 * 1000,
              ).map((p) => ({
                t: new Date(p.utcMs).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                temp: p.temp,
              }));

              return (
                <article key={furnace.id} className="thermo-furnace-card">
                  <div className="thermo-furnace-head">
                    <h3>{furnace.name}</h3>
                    <span className={`status status-${state}`}>{formatTempStatusLabel(state)}</span>
                  </div>
                  <p className="muted small">Текущая температура: {temp} °C</p>
                  <p className="muted small">
                    Садка: <strong>{activeBatch ? "Запущена" : "Нет"}</strong>
                    {activeBatch?.operationType?.trim() ? (
                      <>
                        {" "}
                        · {activeBatch.operationType.trim()}
                      </>
                    ) : null}
                  </p>
                  <div className="thermo-chart-wrap">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={tempSeries}>
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
                  <div className="thermo-actions">
                    {hasPermission(session, "thermo_start_batch") ? (
                      activeBatch ? (
                        <span
                          className="auth-btn auth-btn--disabled thermo-start-btn--busy"
                          title="На этой печи уже идёт садка"
                        >
                          Запустить садку
                        </span>
                      ) : (
                        <Link className="auth-btn" to={`/thermo/new/${furnace.id}`}>
                          Запустить садку
                        </Link>
                      )
                    ) : (
                      <span className="muted small">Нет права на запуск садки</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card thermo-batches-card">
        <h2 className="thermo-batches-heading">Садки</h2>
        {batches.length > 0 && (
          <label className="thermo-batch-search-wrap">
            <span className="muted small">Поиск</span>
            <input
              type="search"
              className="thermo-batch-search-input"
              placeholder="Номер садки, маршрутная карта, исполнитель, операция…"
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              aria-label="Поиск по таблице садок"
            />
          </label>
        )}
        {batches.length === 0 ? (
          <p className="muted">Садок пока нет.</p>
        ) : filteredBatches.length === 0 ? (
          <p className="muted">Ничего не найдено по запросу.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Печь</th>
                <th>№ садки</th>
                <th>Статус</th>
                <th>Название операции</th>
                <th>Маршрутная карта</th>
                <th>Исполнитель</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((b) => {
                const isRunning = now < getBatchEndUtcMs(b);
                return (
                  <tr key={b.id}>
                    <td>{b.furnaceName}</td>
                    <td>{b.batchNo}</td>
                    <td>
                      <span className={isRunning ? "status status-batch" : "status status-off"}>
                        {isRunning ? "Запущена" : "Завершена"}
                      </span>
                    </td>
                    <td>{b.operationType?.trim() || "—"}</td>
                    <td>{b.routeCardNo || "—"}</td>
                    <td>{b.operator || "—"}</td>
                    <td>
                      <Link to={`/thermo/batch/${b.id}`}>Открыть</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
