export function EvaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 46h30a12 12 0 0 0 1-24 16 16 0 0 0-30-3A13 13 0 0 0 18 46z" fill="none" stroke="#1565c0" strokeWidth="6" strokeLinecap="round" />
      <path d="M12 40a13 13 0 0 1 9-20" fill="none" stroke="#f57c00" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function EvaBrand() {
  return (
    <div className="brand">
      <EvaLogo size={32} />
      <span>
        <b>EvA</b> ERP
      </span>
    </div>
  );
}

/** Two people carrying a window – login page illustration. */
export function WindowCarriers({ width = 110 }: { width?: number }) {
  return (
    <svg width={width} viewBox="0 0 120 110" aria-hidden="true">
      <rect x="6" y="6" width="34" height="78" fill="none" stroke="#9aa5b1" strokeWidth="2" />
      <rect x="10" y="10" width="26" height="70" fill="#f3f6f9" stroke="#c4ccd5" />
      <rect x="40" y="18" width="52" height="58" rx="2" fill="#fff" stroke="#2f3b48" strokeWidth="2.5" />
      <line x1="66" y1="18" x2="66" y2="76" stroke="#2f3b48" strokeWidth="2" />
      <path d="M44 72L62 24M70 72L88 24M48 70L60 40M74 70L86 40" stroke="#9fb6c8" strokeWidth="1.5" />
      <circle cx="30" cy="40" r="5" fill="#2f3b48" />
      <path d="M30 46c-6 0-8 6-8 12v18h5l1 22h4l1-22h3V58c0-6-2-12-6-12z" fill="#1d6fd6" />
      <path d="M26 98h6M30 98h6" stroke="#2f3b48" strokeWidth="3" />
      <circle cx="102" cy="44" r="5" fill="#2f3b48" />
      <path d="M102 50c-6 0-8 6-8 12v16h4l2 20h4l1-20h3V62c0-6-2-12-6-12z" fill="#f2a33a" />
      <path d="M98 98h6M103 98h6" stroke="#2f3b48" strokeWidth="3" />
      <path d="M36 54l8 2M94 58l-4 2" stroke="#2f3b48" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
