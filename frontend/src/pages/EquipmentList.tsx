import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEquipmentList, type Equipment } from "../api";
import { canViewEquipmentType, type UserRole } from "../auth";
import { MachineIcon } from "../components/MachineIcon";
import { isHiddenFromEquipmentCatalog } from "../realtime/manualOperatorMachine";
import {
  EQUIPMENT_STATUS_LABEL,
  isCncType,
  statusForEquipment,
} from "../realtime/equipmentStatus";

function statusClass(s: string) {
  return `status status-${s}`;
}

/** В каталоге только станки ЧПУ и (позже) печи. */
function isMonitoredAsset(e: Equipment): boolean {
  if (isHiddenFromEquipmentCatalog(e)) return false;
  const t = (e.equipment_type ?? "").toLowerCase();
  return isCncType(e.equipment_type) || t.includes("печь");
}

export function EquipmentList({ role }: { role: UserRole }) {
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentList()
      .then((data) => {
        if (!cancelled) {
          setItems(
            data.filter((e) => isMonitoredAsset(e) && canViewEquipmentType(role, e.equipment_type)),
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
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (err) {
    return (
      <div className="card error">
        <h2>Не удалось загрузить данные</h2>
        <p>{err}</p>
        <p className="muted">
          Убедитесь, что контейнеры запущены:{" "}
          <code>docker compose up --build</code>
        </p>
      </div>
    );
  }

  if (!items) {
    return <div className="muted">Загрузка…</div>;
  }

  return (
    <div>
      <div className="page-head">
        <h1>Оборудование</h1>
        <p className="muted">Станки ЧПУ и печи: состояние, показатели и сведения по каждой единице оборудования.</p>
      </div>
      <ul className="equipment-grid">
        {items.map((e) => {
          const stateKey = statusForEquipment(e, nowMs);
          return (
            <li key={e.id}>
              <Link to={`/equipment/${e.id}`} className="equipment-card">
                <div className="equipment-card-top">
                  <span className={statusClass(stateKey)}>{EQUIPMENT_STATUS_LABEL[stateKey]}</span>
                  {e.equipment_type && (
                    <span className="type-pill">{e.equipment_type}</span>
                  )}
                </div>
                <h2>
                  {isCncType(e.equipment_type) && <MachineIcon />}
                  {e.name}
                </h2>
                {e.location && <p className="muted small">{e.location}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
