-- Раздельные БД для паттерна database-per-service
CREATE USER equipment_user WITH PASSWORD 'equipment_secret';
CREATE DATABASE equipment OWNER equipment_user;
GRANT ALL PRIVILEGES ON DATABASE equipment TO equipment_user;

CREATE USER metrics_user WITH PASSWORD 'metrics_secret';
CREATE DATABASE metrics OWNER metrics_user;
GRANT ALL PRIVILEGES ON DATABASE metrics TO metrics_user;
