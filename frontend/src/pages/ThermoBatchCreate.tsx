import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchEquipment, type Equipment } from "../api";
import { getSession, hasPermission, type UserRole } from "../auth";
import { buildFurnaceTempSeries } from "../realtime/furnaceCycle";
import { createThermoBatch } from "../thermo/batches";

function canOpenThermo(role: UserRole): boolean {
  return role === "user" || role === "admin" || role === "term";
}

export function ThermoBatchCreate({ role }: { role: UserRole }) {
  const { furnaceId } = useParams();
  const navigate = useNavigate();
  const id = Number(furnaceId);

  const [furnace, setFurnace] = useState<Equipment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [durationMinutes, setDurationMinutes] = useState("60");
  const [routeCardNo, setRouteCardNo] = useState("");
  const [partName, setPartName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [operator, setOperator] = useState("");
  const [foreman, setForeman] = useState("");
  const [controller, setController] = useState("");
  const [setpointTemp, setSetpointTemp] = useState("900");
  const [operationType, setOperationType] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    fetchEquipment(id)
      .then(setFurnace)
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  const shownCharacteristics = useMemo(() => {
    if (!furnace) return [];
    const raw = furnace.characteristics
      .filter((c) => {
        const key = c.key.toLowerCase();
        return key !== "рабочий объем" && key !== "тип нагрева";
      })
      .map((c) => {
        if (c.key.toLowerCase() === "макс. температура") {
          return { ...c, key: "Установленное значение температуры", value: setpointTemp };
        }
        if (c.key.toLowerCase() === "контроллер") {
          return { ...c, value: "ТЕРМОДАТ" };
        }
        return c;
      });

    const hasSetpoint = raw.some((c) => c.key === "Установленное значение температуры");
    const withSetpoint = hasSetpoint
      ? raw.map((c) =>
          c.key === "Установленное значение температуры" ? { ...c, value: setpointTemp } : c,
        )
      : [
          {
            id: -1,
            key: "Установленное значение температуры",
            value: setpointTemp,
            unit: "°C",
          },
          ...raw,
        ];

    const hasController = withSetpoint.some((c) => c.key === "Контроллер");
    const withController = hasController
      ? withSetpoint.map((c) => (c.key === "Контроллер" ? { ...c, value: "ТЕРМОДАТ" } : c))
      : [...withSetpoint, { id: -2, key: "Контроллер", value: "ТЕРМОДАТ", unit: null }];

    const hasProtocol = withController.some((c) => c.key.toLowerCase() === "протокол");
    const withProtocol = hasProtocol
      ? withController.map((c) =>
          c.key.toLowerCase() === "протокол" ? { ...c, value: "Modbus" } : c,
        )
      : [...withController, { id: -3, key: "Протокол", value: "Modbus", unit: null }];

    return [
      ...withProtocol,
      { id: -4, key: "Название операции", value: operationType, unit: null },
    ];
  }, [furnace, operationType, setpointTemp]);

  const chartData = useMemo(() => {
    if (!furnace) return [];
    return buildFurnaceTempSeries(furnace.id, Date.now() - 2 * 60 * 60 * 1000, Date.now(), 2 * 60 * 1000).map(
      (p) => ({
        t: new Date(p.utcMs).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        temp: p.temp,
      }),
    );
  }, [furnace]);

  if (!canOpenThermo(role)) return <Navigate to="/" replace />;
  const sess = getSession();
  if (!sess || !hasPermission(sess, "thermo_start_batch")) {
    return <Navigate to="/thermo" replace />;
  }
  if (!Number.isFinite(id)) return <p className="muted">Некорректный идентификатор печи.</p>;

  const onCreate = () => {
    if (!furnace) return;
    const created = createThermoBatch({
      furnaceId: furnace.id,
      furnaceName: furnace.name,
      durationMinutes,
      routeCardNo,
      partName,
      quantity,
      operator,
      foreman,
      controller,
      setpointTemp,
      operationType,
    });
    navigate(`/thermo/batch/${created.id}`, { replace: true });
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/thermo">Термообработка</Link>
        <span className="sep">/</span>
        <span>Запуск садки</span>
      </div>
      <div className="page-head">
        <h1>Запуск садки</h1>
        {furnace && <p className="muted">Печь: {furnace.name}</p>}
      </div>
      {err && (
        <div className="card error">
          <p>{err}</p>
        </div>
      )}
      <div className="thermo-create-layout">
        <div className="thermo-create-left">
          {furnace && (
            <section className="card">
              <h2>Характеристики печи</h2>
              <ul className="metrics-list">
                {shownCharacteristics.map((c) => (
                  <li key={`${c.id}-${c.key}`}>
                    <span className="metric-key">{c.key}</span>
                    {c.key === "Установленное значение температуры" ? (
                      <span className="metric-val metric-inline-edit">
                        <input
                          className="metric-inline-input"
                          value={setpointTemp}
                          onChange={(e) => setSetpointTemp(e.target.value)}
                          inputMode="numeric"
                        />
                        <span>{c.unit ? ` ${c.unit}` : ""}</span>
                      </span>
                    ) : c.key === "Название операции" ? (
                      <span className="metric-val metric-inline-edit">
                        <input
                          className="metric-inline-input metric-inline-input--wide"
                          value={operationType}
                          onChange={(e) => setOperationType(e.target.value)}
                          placeholder="Введите название операции"
                        />
                      </span>
                    ) : (
                      <span className="metric-val">
                        {c.value}
                        {c.unit ? ` ${c.unit}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Данные садки</h2>
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
            >
              <label>
                Длительность садки (минуты)
                <input
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
              <label>
                Номер маршрутной карты
                <input value={routeCardNo} onChange={(e) => setRouteCardNo(e.target.value)} required />
              </label>
              <label>
                Название детали
                <input value={partName} onChange={(e) => setPartName(e.target.value)} required />
              </label>
              <label>
                Количество деталей
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </label>
              <label>
                Исполнитель
                <input value={operator} onChange={(e) => setOperator(e.target.value)} required />
              </label>
              <label>
                Мастер участка
                <input value={foreman} onChange={(e) => setForeman(e.target.value)} required />
              </label>
              <label>
                Контроллёр
                <input value={controller} onChange={(e) => setController(e.target.value)} required />
              </label>
              <button type="submit">Запустить</button>
            </form>
          </section>
        </div>

        <section className="card thermo-create-right">
          <h2>Температура от времени</h2>
          <div className="thermo-chart-wrap thermo-chart-wrap--big">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData}>
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
      </div>

      {confirmOpen && (
        <div className="confirm-modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>Подтверждение</h3>
            <p>Вы точно уверены, что хотите запустить садку?</p>
            <div className="confirm-actions">
              <button type="button" className="auth-btn" onClick={onCreate}>
                Да
              </button>
              <button type="button" className="auth-btn" onClick={() => setConfirmOpen(false)}>
                Нет
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
