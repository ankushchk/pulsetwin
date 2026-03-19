import { useEffect, useState } from 'react';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

export default function Settings() {
  const { bodyTwin, setBodyTwin } = usePulseTwin();

  const [affordableMode, setAffordableMode] = useState(Boolean(bodyTwin?.affordableMode));
  const [budgetRupees, setBudgetRupees] = useState(
    Number(bodyTwin?.budget?.dailyFoodBudgetRupees ?? 150)
  );
  const [dietaryPreference, setDietaryPreference] = useState(bodyTwin?.dietaryPreference ?? 'non-veg');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAffordableMode(Boolean(bodyTwin?.affordableMode));
    setBudgetRupees(Number(bodyTwin?.budget?.dailyFoodBudgetRupees ?? 150));
    setDietaryPreference(bodyTwin?.dietaryPreference ?? 'non-veg');
  }, [bodyTwin]);

  return (
    <div className="pt-page">
      <div className="pt-container-md">
        <div className="pt-label">Settings</div>
        <h1 className="mt-1 pt-title">Your preferences</h1>

        <div className="mt-8 pt-card p-6 sm:p-8">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">Affordable mode</span>
            <input
              type="checkbox"
              checked={affordableMode}
              onChange={(e) => setAffordableMode(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-zinc-100"
            />
          </label>

          <div className="mt-6">
            <label className="text-sm font-medium text-zinc-300">Daily food budget (Rs)</label>
            <input
              type="number"
              value={budgetRupees}
              onChange={(e) => setBudgetRupees(Number(e.target.value))}
              className="pt-input"
            />
          </div>

          <div className="mt-6">
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

          <button
            type="button"
            onClick={() => {
              setBusy(true);
              setBodyTwin((prev) => ({
                ...prev,
                affordableMode,
                dietaryPreference,
                budget: {
                  ...(prev?.budget || {}),
                  dailyFoodBudgetRupees: Number(budgetRupees)
                },
                updatedAt: new Date().toISOString()
              }));
              setBusy(false);
            }}
            className="pt-btn-primary mt-8"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>

          <p className="mt-4 text-xs text-zinc-500">
            Updates apply to the Grocery agent&apos;s list generation.
          </p>
        </div>
      </div>
    </div>
  );
}
