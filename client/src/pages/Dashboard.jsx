import StatCard from '../components/StatCard.jsx';
import BodyTwinRing from '../components/BodyTwinRing.jsx';
import MacroBreakdown from '../components/MacroBreakdown.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

export default function Dashboard() {
  const { bodyTwin } = usePulseTwin();

  const calories = bodyTwin?.dailyNutrition?.calories;
  const protein = bodyTwin?.dailyNutrition?.protein;
  const carbs = bodyTwin?.dailyNutrition?.carbs;
  const fat = bodyTwin?.dailyNutrition?.fat;

  return (
    <div className="pt-page">
      <div className="pt-container">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="pt-label">Today</div>
            <h1 className="mt-1 pt-title">Dashboard</h1>
          </div>
          <div className="self-start rounded-full border border-white/10 bg-fit-surface px-4 py-2 text-xs text-fit-muted">
            Running in UI-only mode
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <BodyTwinRing label="Recovery score" value={bodyTwin?.recoveryScore ?? '-'} accent="cyan" />
          <StatCard title="Calories" value={calories ?? '-'} accent="rose" />
          <StatCard title="Mood (1-10)" value={bodyTwin?.mood?.moodScore ?? '-'} accent="purple" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MacroBreakdown macros={{ protein, carbs, fat }} />
          <div className="pt-card p-5">
            <div className="text-sm font-semibold text-white">Workout (placeholder)</div>
            <div className="mt-2 text-sm text-fit-muted">
              Workout recommender will be wired to backend AI later.
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-fit-muted">
          Body Twin is stored only in memory (no Firebase).
        </p>
      </div>
    </div>
  );
}
