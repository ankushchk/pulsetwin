import { forwardRef, useMemo } from 'react';

function startOfWeekMonday(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatGoal(type) {
  if (!type) return 'Training';
  const t = String(type).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const WeeklyShareCard = forwardRef(function WeeklyShareCard({ bodyTwin, nutritionLogs }, ref) {
  const weekLabel = useMemo(() => {
    const start = startOfWeekMonday();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opt = { month: 'short', day: 'numeric' };
    const a = start.toLocaleDateString('en-US', opt);
    const b = end.toLocaleDateString('en-US', opt);
    const y = end.getFullYear();
    return `${a} – ${b} ${y}`;
  }, []);

  const dayActivity = useMemo(() => {
    const start = startOfWeekMonday();
    return WEEKDAY_SHORT.map((label, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const meals = nutritionLogs?.[key]?.length ?? 0;
      const score = Math.min(100, Math.max(meals > 0 ? 32 : 10, meals * 36 + 12));
      return { label, key, meals, score };
    });
  }, [nutritionLogs]);

  const mealsLogged = useMemo(
    () => dayActivity.reduce((n, d) => n + d.meals, 0),
    [dayActivity]
  );

  const streak = bodyTwin?.workoutHistory?.streakDays ?? 0;
  const recovery = bodyTwin?.recoveryScore ?? '—';
  const mood = bodyTwin?.mood?.moodScore ?? '—';
  const goal = formatGoal(bodyTwin?.fitnessGoal?.type);
  const weight = bodyTwin?.bodyStats?.weightKg;

  return (
    <div
      ref={ref}
      className="relative w-full max-w-[380px] shrink-0 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-lift"
      style={{ aspectRatio: '9 / 16' }}
    >
      {/* Accent frame */}
      <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-fit-lime/25" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fit-lime/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-fit-cyan/10 blur-3xl" />
      <div className="pointer-events-none absolute right-8 top-1/3 h-32 w-32 rounded-full bg-fit-rose/10 blur-2xl" />

      <div className="relative flex h-full flex-col p-7 pt-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-fit-muted">
          Week in review
        </div>
        <div className="mt-2 font-semibold tracking-tight text-white">
          <span className="text-white">Pulse</span>
          <span className="text-fit-lime"> Twin</span>
        </div>
        <div className="mt-1 text-xs text-fit-muted">{weekLabel}</div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
              Streak
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-fit-lime">
              {streak}
              <span className="ml-1 text-lg font-semibold text-fit-muted">d</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
              Meals logged
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-fit-cyan">
              {mealsLogged}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
              Recovery
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-fit-rose">{recovery}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">Mood</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-fit-purple">{mood}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
            Goal focus
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{goal}</div>
          {weight != null ? (
            <div className="mt-1 text-xs text-fit-muted">Weight · {weight} kg</div>
          ) : null}
        </div>

        <div className="mt-6 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fit-muted">
              Week rhythm
            </span>
            <span className="text-[10px] text-fit-muted">Meals / day</span>
          </div>
          <div className="flex h-28 items-end justify-between gap-1.5 px-0.5">
            {dayActivity.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[22px] rounded-t-lg ${
                      d.meals > 0 ? 'bg-fit-lime' : 'bg-zinc-800'
                    }`}
                    style={{ height: `${d.score}%`, opacity: d.meals > 0 ? 1 : 0.35 }}
                  />
                </div>
                <span className="text-[10px] font-medium text-fit-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto border-t border-white/5 pt-5 text-center">
          <p className="text-[11px] font-medium text-white/90">Consistency wins.</p>
          <p className="mt-1 text-[10px] text-fit-muted">#PulseTwin · #FitnessJourney</p>
        </div>
      </div>
    </div>
  );
});

export default WeeklyShareCard;
