import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { fetchEquipmentList, type Equipment } from "../api";
import { getSession, hasPermission } from "../auth";
import { buildCncSegmentsForWindow } from "../realtime/cncEquipmentBridge";
import type { MachineState } from "../realtime/cycle";
import { isManualOperatorMachine } from "../realtime/manualOperatorMachine";

function isCnc(e: Equipment): boolean {
  const t = (e.equipment_type ?? "").toLowerCase();
  return t.includes("чпу") || t.includes("cnc") || t.includes("станок с пу") || t.includes("пу");
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${m}`;
}

function parseDatetimeLocalValue(v: string): number | null {
  if (!v.trim()) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function roundHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function sumByState(
  segments: Array<{ state: MachineState; startUtc: number; endUtc: number }>,
  states: MachineState[],
): number {
  return segments
    .filter((s) => states.includes(s.state))
    .reduce((sum, s) => sum + (s.endUtc - s.startUtc), 0);
}

export function CncEfficiencyReport() {
  const now = Date.now();
  const [fromV, setFromV] = useState(() => toDatetimeLocalValue(now - 24 * 60 * 60 * 1000));
  const [toV, setToV] = useState(() => toDatetimeLocalValue(now));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canCreate = hasPermission(getSession(), "report_cnc_create");

  const title = useMemo(() => "Отчет по эффективности оборудования", []);

  const onGenerate = async () => {
    if (!canCreate) {
      setErr("Недостаточно прав для создания отчетов по станкам с ПУ.");
      return;
    }
    const fromMs = parseDatetimeLocalValue(fromV);
    const toMs = parseDatetimeLocalValue(toV);
    if (fromMs == null || toMs == null || toMs <= fromMs) {
      setErr("Проверьте период: время окончания должно быть позже времени начала.");
      return;
    }

    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const all = await fetchEquipmentList();
      const cnc = all.filter((e) => isCnc(e) && !isManualOperatorMachine(e));
      const periodMs = toMs - fromMs;
      const tFondHours = roundHours(periodMs);

      const rows = cnc.map((m, idx) => {
        const segs = buildCncSegmentsForWindow(fromMs, toMs, m, Date.now());
        const tProduction = sumByState(segs, ["up"]);
        const tRegl = sumByState(segs, ["tech_idle", "lunch", "service", "accident"]);
        const tUnregl = sumByState(segs, ["equip_idle"]);
        const efficiency = periodMs > 0 ? (((periodMs - tUnregl) / periodMs) * 100) : 0;

        return {
          index: idx + 1,
          machineName: m.name,
          tProductionHours: roundHours(tProduction),
          tReglHours: roundHours(tRegl),
          tUnreglHours: roundHours(tUnregl),
          tFondHours: round2(tFondHours),
          efficiencyPct: round2(efficiency),
        };
      });

      const totals = rows.reduce(
        (acc, r) => {
          acc.tProductionHours += r.tProductionHours;
          acc.tReglHours += r.tReglHours;
          acc.tUnreglHours += r.tUnreglHours;
          acc.tFondHours += r.tFondHours;
          return acc;
        },
        { tProductionHours: 0, tReglHours: 0, tUnreglHours: 0, tFondHours: 0 },
      );
      const totalEfficiencyPct =
        totals.tFondHours > 0
          ? round2(((totals.tFondHours - totals.tUnreglHours) / totals.tFondHours) * 100)
          : 0;

      const matrix: Array<Array<string | number>> = [
        [title],
        [
          "",
          `Период: ${new Date(fromMs).toLocaleString("ru-RU")} — ${new Date(toMs).toLocaleString("ru-RU")}`,
          "",
          "",
          "",
          "",
          "",
        ],
        ["№", "Станок", "Т производства (час)", "Т регл. простоя (час)", "Т нерегл. простоя (час)", "Тфонд (час)", "Эффективность (%)"],
        [
          "",
          "",
          round2(totals.tProductionHours),
          round2(totals.tReglHours),
          round2(totals.tUnreglHours),
          round2(totals.tFondHours),
          totalEfficiencyPct,
        ],
        ...rows.map((r) => [
          r.index,
          r.machineName,
          r.tProductionHours,
          r.tReglHours,
          r.tUnreglHours,
          r.tFondHours,
          r.efficiencyPct,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws["!cols"] = [
        { wch: 6 },
        { wch: 56 },
        { wch: 20 },
        { wch: 24 },
        { wch: 26 },
        { wch: 16 },
        { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Эффективность");
      const fileName = `otchet-effektivnost-${new Date(fromMs).toISOString().slice(0, 10)}-${new Date(toMs).toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setMsg(`Файл отчета создан: ${fileName}`);
    } catch (e) {
      setErr((e as Error).message || "Не удалось сформировать отчет.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/reports">Отчеты</Link>
        <span className="sep">/</span>
        <Link to="/reports/cnc">Станки с ПУ</Link>
        <span className="sep">/</span>
        <span>Отчет по эффективности оборудования</span>
      </div>

      <div className="page-head">
        <h1>Отчет по эффективности оборудования</h1>
        <p className="muted">
          Выберите период и нажмите «Создать» — отчет будет скачан в формате Excel.
        </p>
        {!canCreate && (
          <p className="muted small">Для вашей роли доступен просмотр, но создание отчета отключено.</p>
        )}
      </div>

      {err && (
        <div className="card error">
          <p>{err}</p>
        </div>
      )}
      {msg && (
        <div className="card">
          <p>{msg}</p>
        </div>
      )}

      <section className="card">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onGenerate();
          }}
        >
          <label>
            Дата и время начала
            <input type="datetime-local" value={fromV} onChange={(e) => setFromV(e.target.value)} required />
          </label>
          <label>
            Дата и время окончания
            <input type="datetime-local" value={toV} onChange={(e) => setToV(e.target.value)} required />
          </label>
          <div className="full">
            <button type="submit" disabled={busy || !canCreate}>
              {busy ? "Формирование..." : "Создать"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
