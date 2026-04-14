import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  authenticate,
  hasPermission,
  saveSession,
  type SessionUser,
} from "../../auth";

export function OperatorLogin({
  onAuthed,
}: {
  onAuthed: (session: SessionUser) => void;
}) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="operator-auth-wrap">
      <div className="operator-auth-card card">
        <h1 className="operator-auth-title">Пульт оператора</h1>
        <p className="muted small operator-auth-lead">Вход для поста управления станком</p>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            const s = authenticate(username, password);
            if (!s) {
              setErr("Неверный логин или пароль");
              return;
            }
            if (!hasPermission(s, "operator_panel")) {
              setErr("Нет доступа к пульту оператора. Обратитесь к администратору.");
              return;
            }
            setErr(null);
            const next: SessionUser = { ...s, entry: "operator" };
            saveSession(next);
            onAuthed(next);
            navigate("/operator", { replace: true });
          }}
        >
          <label>
            Логин
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {err && <p className="auth-error">{err}</p>}
          <button type="submit" className="auth-btn operator-auth-submit">
            Войти
          </button>
        </form>
        <p className="muted small">
          <Link to="/login">Вход в основную систему</Link>
        </p>
      </div>
    </div>
  );
}
