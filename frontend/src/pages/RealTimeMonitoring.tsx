import { useEffect, useMemo, useState } from "react";
import { fetchEquipmentList, type Equipment } from "../api";
import { type UserRole } from "../auth";
import { MachineIcon } from "../components/MachineIcon";
import { Link } from "react-router-dom";
import { RealtimeCncMonitoring } from "./RealtimeCncMonitoring";
import { RealtimeFurnaceMonitoring } from "./RealtimeFurnaceMonitoring";
import { machineStateForCncEquipment } from "../realtime/cncEquipmentBridge";
import { STATE_LABEL } from "../realtime/cycle";
import { isManualOperatorMachine } from "../realtime/manualOperatorMachine";
import { formatTempStatusLabel, furnaceStateAt, furnaceTemperatureAt } from "../realtime/furnaceCycle";
import { getActiveBatchForFurnace } from "../thermo/batches";

function isCnc(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("чпу") || t.includes("cnc") || t.includes("станок с пу") || t.includes("пу");
}

function isFurnace(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("печь") || t.includes("furnace");
}

export function RealTimeMonitoring({ role }: { role: UserRole }) {
  if (role === "cnc") {
    return <RealtimeCncMonitoring role={role} />;
  }
  if (role === "term") {
    return <RealtimeFurnaceMonitoring role={role} />;
  }
  return <RealtimeOverview role={role} />;
}

function RealtimeOverview({ role }: { role: UserRole }) {
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchEquipmentList()
      .then((data) => {
        if (!cancelled) {
          setItems(data.filter((e) => isCnc(e) || isFurnace(e)));
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
    const idTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(idTimer);
  }, []);

  const cncItems = useMemo(
    () => (items ?? []).filter((e) => isCnc(e) && !isManualOperatorMachine(e)),
    [items],
  );
  const furnaceItems = useMemo(() => (items ?? []).filter((e) => isFurnace(e)), [items]);

  const showCnc = role === "admin" || role === "user";
  const showFurnaces = role === "admin" || role === "user";

  const furnaceRows = useMemo(
    () =>
      furnaceItems.map((furnace) => {
        const active = getActiveBatchForFurnace(furnace.id, now);
        const state = furnaceStateAt(now, furnace.id, Boolean(active));
        return {
          id: furnace.id,
          name: furnace.name,
          state,
          status: formatTempStatusLabel(state),
          temp: furnaceTemperatureAt(now, furnace.id),
        };
      }),
    [furnaceItems, now],
  );

  if (err) {
    return (
      <div className="card error">
        <h2>Не удалось загрузить мониторинг</h2>
        <p>{err}</p>
      </div>
    );
  }

  if (!items) {
    return <div className="muted">Загрузка…</div>;
  }

  return (
    <div className="rt-page">
      <div className="page-head">
        <h1>Мониторинг в реальном времени</h1>
        <p className="muted rt-page-lead">
          Оперативный статус оборудования по участкам.
        </p>
      </div>
      <div className="rt-overview-grid">
        {showCnc && (
          <section className="card rt-overview-col">
            <div className="rt-overview-head">
              <h2>Станки ЧПУ</h2>
              <Link to="/realtime/cnc" className="rt-open-link">
                Открыть мониторинг
              </Link>
            </div>
            {cncItems.length === 0 ? (
              <p className="muted">Нет станков ЧПУ.</p>
            ) : (
              <ul className="rt-overview-list">
                {cncItems.map((machine) => {
                  const state = machineStateForCncEquipment(now, machine);
                  return (
                    <li key={machine.id} className="rt-overview-item">
                      <span className="rt-gantt-name">
                        <MachineIcon />
                        {machine.name}
                      </span>
                      <span className={`status status-${state}`}>{STATE_LABEL[state]}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {showFurnaces && (
          <section className="card rt-overview-col">
            <div className="rt-overview-head">
              <h2>Печи</h2>
              <Link to="/realtime/furnaces" className="rt-open-link">
                Открыть мониторинг
              </Link>
            </div>
            {furnaceRows.length === 0 ? (
              <p className="muted">Нет печей в каталоге.</p>
            ) : (
              <ul className="rt-overview-list">
                {furnaceRows.map((furnace) => (
                  <li key={furnace.id} className="rt-overview-item">
                    <span className="rt-overview-name">{furnace.name}</span>
                    <span className={`status status-${furnace.state}`}>{furnace.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {!showCnc && !showFurnaces && (
          <div className="card">
            <p className="muted">Для вашей роли эта страница недоступна.</p>
          </div>
        )}
      </div>
    </div>
  );
}
