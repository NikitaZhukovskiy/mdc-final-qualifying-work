import { Link } from "react-router-dom";

export function RegisterPage() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h2>Регистрация</h2>
        <p>
          Самостоятельная регистрация отключена. Для получения доступа обратитесь к
          администратору системы.
        </p>
        <p className="muted small">
          Администратор может создать учётную запись в разделе «Администрирование».
        </p>
        <p className="muted small">
          <Link to="/login">Вернуться ко входу</Link>
        </p>
      </div>
    </div>
  );
}
