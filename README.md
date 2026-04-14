# mdc-final-qualifying-work

**MDC (final qualifying work)** — веб-система мониторинга производственного оборудования (станки с ПУ, печи термообработки): мониторинг в реальном времени, пульт оператора, отчёты, администрирование. Сервисы упакованы в Docker Compose.

Рекомендуемое имя репозитория на GitHub: `mdc-final-qualifying-work` (в названии без пробелов; в описании репозитория можно указать полное название).

## Что нужно на новом компьютере

- **Git** — [https://git-scm.com/downloads](https://git-scm.com/downloads)
- **Docker Desktop** (Windows/macOS) или **Docker Engine + Docker Compose v2** (Linux) — [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/)

Проверка в терминале:

```bash
git --version
docker compose version
```

## Запуск с нуля

1. **Клонировать репозиторий**

   ```bash
   git clone https://github.com/<ваш-логин>/mdc-final-qualifying-work.git
   cd mdc-final-qualifying-work
   ```

2. **Собрать образы и поднять контейнеры**

   ```bash
   docker compose up --build -d
   ```

   При первом запуске PostgreSQL выполнит скрипт `infra/init-db.sql` и создаст отдельные БД для сервисов `equipment` и `metrics`.

3. **Открыть приложение в браузере**

   - Основной интерфейс: **http://localhost:8080**

   Порт **8080** проброшен на шлюз `gateway` (Nginx), который отдаёт фронтенд и проксирует API на микросервисы.

4. **Остановка**

   ```bash
   docker compose down
   ```

   Полностью удалить данные БД (том `pgdata`):

   ```bash
   docker compose down -v
   ```

## Локальная разработка фронтенда (опционально)

Если нужен hot-reload UI при уже запущенном Docker:

1. Оставьте запущенным стек из шага выше (чтобы на `localhost:8080` работали API через gateway).
2. В другом терминале:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Откройте **http://localhost:5173** — Vite проксирует запросы `/api` на `http://localhost:8080`.

## Состав сервисов

| Сервис            | Назначение                          |
|-------------------|-------------------------------------|
| `postgres`        | PostgreSQL, две БД: equipment, metrics |
| `equipment-service` | REST API справочника оборудования |
| `metrics-service`   | REST API телеметрии / показаний  |
| `frontend`        | Статическая сборка React (Nginx)   |
| `gateway`         | Единая точка входа, маршрутизация `/api` |

## Публикация на GitHub (если репозиторий ещё пустой)

1. На [github.com/new](https://github.com/new) создайте репозиторий **mdc-final-qualifying-work** (без README и .gitignore, чтобы не было конфликта).
2. В корне проекта выполните (подставьте свой логин вместо `YOUR_USER`):

   ```bash
   git remote add origin https://github.com/YOUR_USER/mdc-final-qualifying-work.git
   git branch -M main
   git push -u origin main
   ```

## Примечание

Логины по умолчанию для входа в приложение задаются на стороне клиента (см. модуль авторизации во фронтенде). Для продакшена замените секреты БД и ограничьте доступ к портам.
