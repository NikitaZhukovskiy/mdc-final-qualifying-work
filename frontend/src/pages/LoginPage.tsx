import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { authenticate, type SessionUser } from "../auth";

export function LoginPage({
  onLogin,
  alreadyLoggedIn,
}: {
  onLogin: (session: SessionUser) => void;
  alreadyLoggedIn: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (alreadyLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h2>Авторизация</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            const s = authenticate(username, password);
            if (!s) {
              setErr("Неверный логин или пароль");
              return;
            }
            setErr(null);
            onLogin(s);
          }}
        >
          <label>
            Логин
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {err && <p className="auth-error">{err}</p>}
          <button type="submit" className="auth-btn">
            Войти
          </button>
        </form>
        <p className="muted small">
          Нет доступа? <Link to="/register">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}
