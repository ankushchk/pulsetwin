import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';
import { BODY_TYPES, EQUIPMENT_TYPES, GOALS } from '../../../shared/constants.js';
import { defaultBodyTwin } from '../../../shared/bodyTwinDefaults.js';

export default function Onboarding() {
  const navigate = useNavigate();
  const { setBodyTwin } = usePulseTwin();

  const [goal, setGoal] = useState(GOALS[0]);
  const [bodyType, setBodyType] = useState(BODY_TYPES[0]);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [muscleMassKg, setMuscleMassKg] = useState('');
  const [budgetRupees, setBudgetRupees] = useState(150);
  const [equipmentAvailable, setEquipmentAvailable] = useState(EQUIPMENT_TYPES[0]);
  const [affordableMode, setAffordableMode] = useState(false);
  const [dietaryPreference, setDietaryPreference] = useState('non-veg');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="pt-page">
      <div className="pt-container-narrow">
        <header className="mb-8">
          <div className="pt-label">Pulse Twin</div>
          <h1 className="mt-2 pt-title">Onboarding</h1>
        </header>

        <div className="pt-card p-6 sm:p-8">
          <p className="text-sm text-zinc-400">Step 2 of 2 — Body Twin setup</p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-zinc-300">Fitness goal</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="pt-select"
              >
                {GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Body type</label>
              <select
                value={bodyType}
                onChange={(e) => setBodyType(e.target.value)}
                className="pt-select"
              >
                {BODY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-300">Height (cm)</label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="pt-input"
                  placeholder="e.g. 170"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300">Weight (kg)</label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="pt-input"
                  placeholder="e.g. 65"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-300">Body fat (%)</label>
                <input
                  type="number"
                  value={bodyFatPct}
                  onChange={(e) => setBodyFatPct(e.target.value)}
                  className="pt-input"
                  placeholder="e.g. 18"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300">Muscle mass (kg)</label>
                <input
                  type="number"
                  value={muscleMassKg}
                  onChange={(e) => setMuscleMassKg(e.target.value)}
                  className="pt-input"
                  placeholder="e.g. 25"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Daily budget (Rs)</label>
              <input
                type="number"
                value={budgetRupees}
                onChange={(e) => setBudgetRupees(Number(e.target.value))}
                className="pt-input"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Dietary preference</label>
              <select
                value={dietaryPreference}
                onChange={(e) => setDietaryPreference(e.target.value)}
                className="pt-select"
              >
                <option value="veg">veg</option>
                <option value="non-veg">non-veg</option>
                <option value="vegan">vegan</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-300">Equipment</label>
                <select
                  value={equipmentAvailable}
                  onChange={(e) => setEquipmentAvailable(e.target.value)}
                  className="pt-select"
                >
                  {EQUIPMENT_TYPES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
                  <span className="text-sm font-medium text-zinc-300">Affordable mode</span>
                  <input
                    type="checkbox"
                    checked={affordableMode}
                    onChange={(e) => setAffordableMode(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-zinc-100 accent-zinc-100"
                  />
                </label>
              </div>
            </div>

            {error ? <div className="text-sm text-red-400">{error}</div> : null}

            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const next = {
                    ...defaultBodyTwin,
                    bodyStats: {
                      heightCm: heightCm ? Number(heightCm) : null,
                      weightKg: weightKg ? Number(weightKg) : null,
                      bodyFatPct: bodyFatPct ? Number(bodyFatPct) : null,
                      muscleMassKg: muscleMassKg ? Number(muscleMassKg) : null
                    },
                    fitnessGoal: { type: goal },
                    bodyType,
                    budget: { dailyFoodBudgetRupees: Number(budgetRupees) },
                    equipmentAvailable,
                    affordableMode,
                    dietaryPreference,
                    updatedAt: new Date().toISOString()
                  };

                  setBodyTwin(next);
                  navigate('/dashboard');
                } catch (e) {
                  setError(e?.message || 'Failed to set up');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="pt-btn-primary"
            >
              {busy ? 'Saving...' : 'Finish setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
