import { useMemo, useState } from 'react';
import MacroBreakdown from '../components/MacroBreakdown.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

export default function MealLogger() {
  const { bodyTwin, nutritionLogs, addNutritionLogEntry } = usePulseTwin();

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [mealName, setMealName] = useState(null);

  const dailyNutrition = useMemo(() => bodyTwin?.dailyNutrition || null, [bodyTwin]);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todaysEntries = nutritionLogs?.[todayKey] || [];

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setMealName(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) setPreviewUrl(URL.createObjectURL(f));
  };

  const readFileAsDataUrl = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const onRecognize = async () => {
    if (!file) return;
    setRecognizing(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const mimeType = file.type || null;

      const baseUrl = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${baseUrl}/api/food/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, mimeType })
      });

      if (!response.ok) {
        let message = 'Failed to recognize food';
        try {
          const errJson = await response.json();
          message = errJson?.message || message;
        } catch {
          // ignore
        }

        window.dispatchEvent(
          new CustomEvent('pulse-toast', { detail: { type: 'error', message } })
        );
        return;
      }

      const payload = await response.json();
      const data = payload?.data || {};

      const totals = data?.totals || {};
      const entry = {
        meal: data?.meal || null,
        calories: totals?.calories ?? null,
        protein: totals?.protein_g ?? null,
        carbs: totals?.carbs_g ?? null,
        fat: totals?.fat_g ?? null,
        timestamp: new Date().toISOString()
      };

      setMealName(entry.meal);
      addNutritionLogEntry(todayKey, entry);
    } finally {
      setRecognizing(false);
    }
  };

  return (
    <div className="pt-page">
      <div className="pt-container-narrow">
        <div className="pt-label">Meal Logger</div>
        <h1 className="mt-1 pt-title">Log a meal</h1>

        <div className="mt-8 pt-card p-6 sm:p-8">
          <p className="text-sm text-zinc-400">
            Upload a meal photo. GPT-4o will estimate meal + macros, and we&apos;ll log it for today.
          </p>

          <div className="mt-5">
            <input
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border file:border-zinc-700 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-200 hover:file:border-zinc-600 hover:file:bg-zinc-800"
            />
          </div>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Meal preview"
              className="mt-5 aspect-[4/3] w-full rounded-xl border border-zinc-800 object-cover"
            />
          ) : null}

          <button
            type="button"
            onClick={onRecognize}
            className="pt-btn-primary mt-5 w-full"
            disabled={!file || recognizing}
          >
            {recognizing ? 'Recognizing...' : 'Recognize food'}
          </button>

          {mealName ? <div className="mt-4 text-sm text-zinc-300">Detected: {mealName}</div> : null}
        </div>

        <div className="mt-6 pt-card p-5">
          <div className="text-sm font-semibold text-zinc-100">Today&apos;s meal logs</div>
          {todaysEntries.length ? (
            <div className="mt-4 space-y-3">
              {todaysEntries
                .slice()
                .reverse()
                .map((e, idx) => (
                  <div
                    key={`${e.timestamp || idx}-${idx}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                  >
                    <div className="text-sm font-semibold text-zinc-100">{e.meal || 'Meal'}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {e.calories} kcal • P {e.protein}g • C {e.carbs}g • F {e.fat}g
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="mt-4 text-xs text-zinc-500">No meals logged yet today.</div>
          )}
        </div>

        <div className="mt-6">
          <MacroBreakdown
            macros={{
              protein: dailyNutrition?.protein,
              carbs: dailyNutrition?.carbs,
              fat: dailyNutrition?.fat
            }}
          />
          {dailyNutrition?.calories ? (
            <div className="mt-4 text-xs text-zinc-500">
              Calories: {dailyNutrition.calories} kcal
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
