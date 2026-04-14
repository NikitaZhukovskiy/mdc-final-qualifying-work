function PrinterIcon() {
  return (
    <svg className="batch-print-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 9V3h12v6h2a2 2 0 0 1 2 2v5h-4v4H6v-4H2v-5a2 2 0 0 1 2-2h2zm2 0h8V5H8v4zm-4 4a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2H4zm2 6h12v-2H6v2z"
      />
    </svg>
  );
}

/** Одно действие: системная печать (как «Печать…» в прежнем меню). */
export function ThermoBatchPrintMenu() {
  return (
    <button
      type="button"
      className="batch-print-trigger no-print"
      title="Печать"
      onClick={() => window.setTimeout(() => window.print(), 0)}
    >
      <PrinterIcon />
      <span className="sr-only">Печать</span>
    </button>
  );
}
