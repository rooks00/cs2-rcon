export function RelayLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relay-logo ${compact ? "relay-logo--compact" : ""}`} aria-label="CS2 RCON">
      <span>CS2 RCON</span>
    </div>
  );
}
