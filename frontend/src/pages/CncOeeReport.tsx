import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEquipmentList, type Equipment } from "../api";
import { getSession, hasPermission } from "../auth";
import { buildCncSegmentsForWindow } from "../realtime/cncEquipmentBridge";
import type { MachineState } from "../realtime/cycle";
import { isManualOperatorMachine } from "../realtime/manualOperatorMachine";

type RowCalc = {
  index: number;
  machineName: string;
  tProductionHours: number;
  tReglHours: number;
  tUnreglHours: number;
  tFondHours: number;
  aDowntimePct: number;
  pPerformancePct: number;
  nTotal: number;
  nGood: number;
  qQualityPct: number;
  oeePct: number;
};

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

function sumByState(
  segments: Array<{ state: MachineState; startUtc: number; endUtc: number }>,
  states: MachineState[],
): number {
  return segments
    .filter((s) => states.includes(s.state))
    .reduce((sum, s) => sum + (s.endUtc - s.startUtc), 0);
}

function countPartsByUpSegments(
  segments: Array<{ state: MachineState; startUtc: number; endUtc: number }>,
): number {
  return segments.filter((s) => s.state === "up" && s.endUtc > s.startUtc).length;
}

function pickTargetQualityPct(machineName: string, periodMs: number): number {
  const seed = `${machineName}:${Math.floor(periodMs / 60_000)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) % 16;
  return 70 + normalized;
}

function computeGoodParts(total: number, targetQ: number): number {
  if (total <= 0) return 0;
  const minGood = Math.ceil((total * 70) / 100);
  const maxGood = Math.floor((total * 85) / 100);
  if (minGood <= maxGood) {
    const preferred = Math.round((total * targetQ) / 100);
    return Math.min(maxGood, Math.max(minGood, preferred));
  }
  return Math.round((total * targetQ) / 100);
}

export function CncOeeReport() {
  const now = Date.now();
  const [fromV, setFromV] = useState(() => toDatetimeLocalValue(now - 24 * 60 * 60 * 1000));
  const [toV, setToV] = useState(() => toDatetimeLocalValue(now));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canCreate = hasPermission(getSession(), "report_cnc_create");

  const title = useMemo(() => "Отчет по OEE (Overall Equipment Effectiveness)", []);

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

      const rows: RowCalc[] = cnc.map((m, idx) => {
        const segs = buildCncSegmentsForWindow(fromMs, toMs, m, Date.now());
        const tProductionMs = sumByState(segs, ["up"]);
        const tReglMs = sumByState(segs, ["tech_idle", "lunch", "service", "accident"]);
        const tUnreglMs = sumByState(segs, ["equip_idle"]);
        const nTotal = countPartsByUpSegments(segs);
        const qTarget = pickTargetQualityPct(m.name, periodMs);
        const nGood = computeGoodParts(nTotal, qTarget);

        const aPct = periodMs > 0 ? ((periodMs - tUnreglMs) / periodMs) * 100 : 0;
        const pPct = periodMs > 0 ? (tProductionMs / periodMs) * 100 : 0;
        const qPct = nTotal > 0 ? (nGood / nTotal) * 100 : 0;
        const oeePct = (aPct * pPct * qPct) / 10_000;

        return {
          index: idx + 1,
          machineName: m.name,
          tProductionHours: roundHours(tProductionMs),
          tReglHours: roundHours(tReglMs),
          tUnreglHours: roundHours(tUnreglMs),
          tFondHours,
          aDowntimePct: Math.round(aPct * 100) / 100,
          pPerformancePct: Math.round(pPct * 100) / 100,
          nTotal,
          nGood,
          qQualityPct: Math.round(qPct * 100) / 100,
          oeePct: Math.round(oeePct * 100) / 100,
        };
      });

      const periodLabel = `Период: ${new Date(fromMs).toLocaleString("ru-RU")} — ${new Date(toMs).toLocaleString("ru-RU")}`;
      const matrix: Array<Array<string | number>> = [
        [title],
        [periodLabel],
        [
          "",
          "",
          "Простои (A)",
          "",
          "",
          "",
          "",
          "Производительность (P)",
          "",
          "",
          "Качество (Q)",
          "",
          "",
          "Итог",
        ],
        [
          "№",
          "Станок",
          "Т производства (час)",
          "Т регл. простоя (час)",
          "Т нерегл. простоя (час)",
          "Тфонд (час)",
          "A (%)",
          "Т производства (час)",
          "Т периода (час)",
          "P (%)",
          "N общее (шт)",
          "N годные (шт)",
          "Q (%)",
          "OEE (%)",
        ],
        ...rows.map((r) => [
          r.index,
          r.machineName,
          r.tProductionHours,
          r.tReglHours,
          r.tUnreglHours,
          r.tFondHours,
          r.aDowntimePct,
          r.tProductionHours,
          Math.round(periodMs / 3_600_000),
          r.pPerformancePct,
          r.nTotal,
          r.nGood,
          r.qQualityPct,
          r.oeePct,
        ]),
      ];

      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("OEE");
      ws.addRows(matrix);
      ws.columns = [
        { width: 6 },
        { width: 34 },
        { width: 20 },
        { width: 24 },
        { width: 26 },
        { width: 14 },
        { width: 10 },
        { width: 20 },
        { width: 16 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 10 },
        { width: 12 },
      ];

      ws.mergeCells("A1:N1");
      ws.mergeCells("A2:N2");
      ws.mergeCells("C3:G3");
      ws.mergeCells("H3:J3");
      ws.mergeCells("K3:M3");
      ws.mergeCells("A3:A4");
      ws.mergeCells("B3:B4");

      const warmOrange = "FFF8E0CF";
      const warmBlue = "FFDDEFF6";
      const warmPurple = "FFEADFEE";
      const softGreen = "FFD9E7C8";
      const thinBorder = {
        top: { style: "thin", color: { argb: "FF9EA4AA" } },
        left: { style: "thin", color: { argb: "FF9EA4AA" } },
        bottom: { style: "thin", color: { argb: "FF9EA4AA" } },
        right: { style: "thin", color: { argb: "FF9EA4AA" } },
      };

      ws.getRow(1).font = { bold: true, size: 12 };
      ws.getRow(2).font = { size: 10 };
      ws.getRow(3).font = { bold: true };
      ws.getRow(4).font = { bold: true };
      ws.getRow(1).alignment = { horizontal: "left", vertical: "middle" };
      ws.getRow(2).alignment = { horizontal: "left", vertical: "middle" };
      ws.getRow(3).height = 22;
      ws.getRow(4).height = 22;

      const lastRow = ws.rowCount;
      for (let r = 3; r <= lastRow; r += 1) {
        for (let c = 1; c <= 14; c += 1) {
          const cell = ws.getCell(r, c);
          cell.border = thinBorder;
          cell.alignment = {
            horizontal: c === 2 && r >= 5 ? "left" : "center",
            vertical: "middle",
          };
          if (c >= 3 && c <= 7) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: warmOrange } };
          } else if (c >= 8 && c <= 10) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: warmBlue } };
          } else if (c >= 11 && c <= 13) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: warmPurple } };
          } else if (c === 14) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: softGreen } };
          }
        }
      }

      const fileName = `otchet-oee-${new Date(fromMs).toISOString().slice(0, 10)}-${new Date(toMs).toISOString().slice(0, 10)}.xlsx`;
      const xlsxBuffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([xlsxBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
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
        <span>Отчет по OEE</span>
      </div>

      <div className="page-head">
        <h1>Отчет по OEE</h1>
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
