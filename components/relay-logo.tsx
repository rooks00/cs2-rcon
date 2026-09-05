export function RelayLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relay-logo ${compact ? "relay-logo--compact" : ""}`} aria-label="Relay">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M7 8.5h13.8c5.1 0 8.2 2.8 8.2 7.2 0 3.2-1.8 5.5-4.9 6.5L30 28h-7.2l-5.1-5.1h-4.8V28H7V8.5Zm5.9 5v4.7h7.2c1.8 0 2.8-.8 2.8-2.4 0-1.5-1-2.3-2.8-2.3h-7.2Z" />
      </svg>
      {!compact && <span>Relay<span className="logo-period">.</span></span>}
    </div>
  );
}
