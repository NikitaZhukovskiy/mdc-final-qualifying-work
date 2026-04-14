import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchEquipment,
  fetchLatestMetrics,
  type Equipment,
  type MetricSummary,
} from "../api";
import { canViewEquipmentType, type UserRole } from "../auth";
import { MachineIcon } from "../components/MachineIcon";
import { cncLiveCharacteristicRowsForEquipment } from "../realtime/cncEquipmentDisplay";
import { furnaceTemperatureAt } from "../realtime/furnaceCycle";
import {
  EQUIPMENT_STATUS_LABEL,
  isCncType,
  statusForEquipment,
} from "../realtime/equipmentStatus";

function statusClass(s: string) {
  return `status status-${s}`;
}

function isFurnaceType(equipmentType: string | null): boolean {
  const t = (equipmentType ?? "").toLowerCase();
  return t.includes("печь") || t.includes("furnace");
}

export function EquipmentDetail({ role }: { role: UserRole }) {
  const { id } = useParams();
  const numId = Number(id);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [latest, setLatest] = useState<MetricSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(numId)) return;
    let cancelled = false;
    setErr(null);
    Promise.all([fetchEquipment(numId), fetchLatestMetrics(numId)])
      .then(([eq, lat]) => {
        if (!cancelled) {
          setEquipment(eq);
          setLatest(lat);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [numId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cncRowsForDetail = useMemo(() => {
    if (!equipment || !isCncType(equipment.equipment_type)) return null;
    return cncLiveCharacteristicRowsForEquipment(equipment, nowMs, null);
  }, [equipment, nowMs]);

  const isFurnace = useMemo(
    () => Boolean(equipment && isFurnaceType(equipment.equipment_type)),
    [equipment],
  );
  const currentFurnaceTemp = useMemo(
    () => (equipment && isFurnace ? furnaceTemperatureAt(nowMs, equipment.id) : null),
    [equipment, isFurnace, nowMs],
  );

  const displayMetrics = useMemo(() => {
    if (!latest || !equipment) return {};
    const m = { ...latest.metrics };
    if (isFurnace && m.temperature_c === undefined) {
      m.temperature_c = furnaceTemperatureAt(nowMs, equipment.id);
    }
    return m;
  }, [latest, equipment, isFurnace, nowMs]);

  if (!Number.isFinite(numId)) {
    return <p className="muted">Некорректный идентификатор.</p>;
  }

  if (err) {
    return (
      <div className="card error">
        <h2>Ошибка</h2>
        <p>{err}</p>
        <Link to="/">← К списку</Link>
      </div>
    );
  }

  if (!equipment || !latest) {
    return <div className="muted">Загрузка…</div>;
  }

  if (!canViewEquipmentType(role, equipment.equipment_type)) {
    return (
      <div className="card">
        <h2>Доступ ограничен</h2>
        <p className="muted">Для вашей роли это оборудование недоступно.</p>
      </div>
    );
  }

  const stateKey = statusForEquipment(equipment, nowMs);

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">Оборудование</Link>
        <span className="sep">/</span>
        <span>{equipment.name}</span>
      </div>
      <div className="detail-head">
        <div>
          <h1>
            {isCncType(equipment.equipment_type) && <MachineIcon />}
            {equipment.name}
          </h1>
          <p className="muted">
            {equipment.equipment_type && `${equipment.equipment_type} · `}
            {equipment.serial_number && `S/N ${equipment.serial_number}`}
          </p>
        </div>
        <span className={statusClass(stateKey)}>{EQUIPMENT_STATUS_LABEL[stateKey]}</span>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Сведения</h2>
          <dl className="kv">
            <dt>Место</dt>
            <dd>{equipment.location ?? "—"}</dd>
            <dt>Примечания</dt>
            <dd>{equipment.notes ?? "—"}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Текущие показатели</h2>
          {cncRowsForDetail ? (
            <>
              <p className="muted small">
                Значения привязаны к состоянию станка (демо-цикл). В простое и при
                выключении — нули.
              </p>
              <ul className="metrics-list">
                {cncRowsForDetail.map((row) => (
                  <li key={row.key}>
                    <span className="metric-key">{row.key}</span>
                    <span className="metric-val">
                      {row.value}
                      {row.unit ? ` ${row.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {!isFurnace && latest.last_recorded_at && (
                <p className="muted small">
                  Обновлено:{" "}
                  {new Date(latest.last_recorded_at).toLocaleString("ru-RU")}
                </p>
              )}
              {isFurnace && currentFurnaceTemp != null ? (
                <ul className="metrics-list">
                  <li>
                    <span className="metric-key">Текущая температура</span>
                    <span className="metric-val">{currentFurnaceTemp} °C</span>
                  </li>
                </ul>
              ) : Object.keys(displayMetrics).length === 0 ? (
                <p className="muted">Нет телеметрии для этого узла.</p>
              ) : (
                <ul className="metrics-list">
                  {Object.entries(displayMetrics).map(([k, v]) => (
                    <li key={k}>
                      <span className="metric-key">{k}</span>
                      <span className="metric-val">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {!isCncType(equipment.equipment_type) && (
        <section className="card">
          <h2>Характеристики</h2>
          {equipment.characteristics.length === 0 ? (
            <p className="muted">Не заданы.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Параметр</th>
                  <th>Значение</th>
                </tr>
              </thead>
              <tbody>
                {equipment.characteristics.map((c) => (
                  <tr key={c.id}>
                    <td>{c.key}</td>
                    <td>
                      {c.value}
                      {c.unit ? ` ${c.unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

    </div>
  );
}
