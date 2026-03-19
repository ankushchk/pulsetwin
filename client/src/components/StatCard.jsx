const ACCENT_VALUE = {
  lime: 'text-fit-lime',
  rose: 'text-fit-rose',
  cyan: 'text-fit-cyan',
  purple: 'text-fit-purple',
  white: 'text-white'
};

export default function StatCard({ title, value, accent = 'white' }) {
  const valueClass = ACCENT_VALUE[accent] || ACCENT_VALUE.white;

  return (
    <div className="pt-card p-5 sm:p-6">
      <div className="pt-label">{title}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}>
        {value ?? '-'}
      </div>
    </div>
  );
}
