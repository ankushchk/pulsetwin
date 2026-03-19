export default function MacroBreakdown({ macros }) {
  const protein = macros?.protein ?? '-';
  const carbs = macros?.carbs ?? '-';
  const fat = macros?.fat ?? '-';

  return (
    <div className="pt-card p-5 sm:p-6">
      <div className="text-sm font-semibold text-white">Macros</div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/5 bg-black/35 p-3">
          <div className="text-xs font-medium text-fit-muted">Protein</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fit-rose">{protein}</div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/35 p-3">
          <div className="text-xs font-medium text-fit-muted">Carbs</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fit-cyan">{carbs}</div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/35 p-3">
          <div className="text-xs font-medium text-fit-muted">Fat</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fit-purple">{fat}</div>
        </div>
      </div>
    </div>
  );
}
