import { Link } from "react-router-dom";

export function CncReports() {
  return (
    <div>
      <div className="breadcrumb">
        <Link to="/reports">Отчеты</Link>
        <span className="sep">/</span>
        <span>Станки с ПУ</span>
      </div>

      <div className="page-head">
        <h1>Отчеты — станки с ПУ</h1>
        <p className="muted">Выберите тип отчета.</p>
      </div>

      <div className="report-cards-grid">
        <article className="card report-card">
          <h2>Отчет по эффективности оборудования</h2>
          <p className="muted small">
            Отчет по времени производства, регламентированным и нерегламентированным
            простоям и эффективности каждой единицы оборудования.
          </p>
          <Link className="auth-btn" to="/reports/cnc/efficiency">
            Открыть отчет
          </Link>
        </article>

        <article className="card report-card">
          <h2>Отчет по OEE</h2>
          <p className="muted small">
            Отчет по показателям общей эффективности оборудования с учетом простоев,
            производственного цикла оборудования и качества итоговой продукции.
          </p>
          <Link className="auth-btn" to="/reports/cnc/oee">
            Открыть отчет
          </Link>
        </article>
      </div>
    </div>
  );
}
