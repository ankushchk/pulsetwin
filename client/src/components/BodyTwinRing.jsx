const ACCENT_VALUE = {
  lime: 'text-fit-lime',
  rose: 'text-fit-rose',
  cyan: 'text-fit-cyan',
  purple: 'text-fit-purple',
  white: 'text-white'
};

export default function BodyTwinRing({ label, value, accent = 'cyan' }) {
  const valueClass = ACCENT_VALUE[accent] || ACCENT_VALUE.white;

  return (
    <div className="pt-card p-5 sm:p-6">
      <div className="text-sm font-medium text-fit-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${valueClass}`}>
        {value ?? '-'}
      </div>
      <div className="mt-1 text-xs text-fit-muted/90">Body Twin indicator</div>
    </div>
  );
}
