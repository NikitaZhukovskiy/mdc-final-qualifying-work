export function MachineIcon() {
  return (
    <svg
      className="machine-icon"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2.2" className="machine-icon-body" />
      <rect x="5.2" y="7" width="6.8" height="9.5" rx="0.8" className="machine-icon-door" />
      <rect x="12.9" y="7.2" width="6.2" height="9.2" rx="0.8" className="machine-icon-window" />
      <circle cx="16" cy="11.8" r="1.45" className="machine-icon-part" />
      <rect x="9.5" y="17.7" width="5" height="1.1" rx="0.55" className="machine-icon-base" />
    </svg>
  );
}
