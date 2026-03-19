export default function ExerciseCard({
  name,
  details,
  onDone,
  why,
  timer,
  active,
  completed
}) {
  const activeClasses = active
    ? 'border-fit-lime/35 bg-fit-lime/5 ring-1 ring-fit-lime/30'
    : '';
  const completedClasses = completed ? 'border-fit-lime/25 bg-fit-lime/10' : '';

  return (
    <div
      className={`pt-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-white/10 ${activeClasses} ${completedClasses}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{name}</div>
          {details ? <div className="mt-1 text-sm text-fit-muted">{details}</div> : null}
          {why ? <div className="mt-2 text-xs font-medium text-white/80">{why}</div> : null}
          {timer ? <div className="mt-3">{timer}</div> : null}
        </div>
        {onDone ? (
          <button type="button" onClick={onDone} className="shrink-0 pt-btn-secondary px-3 py-2 text-xs">
            Mark Done
          </button>
        ) : null}
      </div>
    </div>
  );
}
