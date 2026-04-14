import { Link } from "react-router-dom";

export function ReportsDashboard() {
  return (
    <div>
      <div className="page-head">
        <h1>Отчеты</h1>
        <p className="muted">Выберите участок для формирования отчетов.</p>
      </div>

      <div className="reports-columns">
        <section className="card reports-col">
          <h2>Станки с ПУ</h2>
          <p className="muted small">Отчеты по работе станков с программным управлением.</p>
          <Link className="auth-btn" to="/reports/cnc">
            Открыть раздел
          </Link>
        </section>

        <section className="card reports-col">
          <h2>Термообработка</h2>
          <p className="muted small">Отчеты по печам.</p>
          <Link className="auth-btn" to="/reports/thermo">
            Открыть раздел
          </Link>
        </section>
      </div>
    </div>
  );
}
