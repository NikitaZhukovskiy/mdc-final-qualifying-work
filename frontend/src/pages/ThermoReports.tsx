import { Link } from "react-router-dom";

export function ThermoReports() {
  return (
    <div>
      <div className="breadcrumb">
        <Link to="/reports">Отчеты</Link>
        <span className="sep">/</span>
        <span>Термообработка</span>
      </div>

      <div className="page-head">
        <h1>Отчеты — термообработка</h1>
        <p className="muted">Выберите тип отчета.</p>
      </div>

      <div className="report-cards-grid">
        <article className="card report-card">
          <h2>Отчет по времени</h2>
          <p className="muted small">
            Показывает температуру выбранной печи за заданный период с диаграммой и таблицей
            значений.
          </p>
          <Link className="auth-btn" to="/reports/thermo/time">
            Открыть отчет
          </Link>
        </article>
      </div>
    </div>
  );
}
