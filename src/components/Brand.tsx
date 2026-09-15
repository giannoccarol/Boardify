export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-mark" src="/boardify.svg" alt="" draggable={false} />
      {!compact && <span>boardify<span className="brand-dot">.</span></span>}
    </div>
  );
}
