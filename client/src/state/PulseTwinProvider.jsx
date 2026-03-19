import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { defaultBodyTwin } from '../../../shared/bodyTwinDefaults.js';

const PulseTwinContext = createContext(null);

function getDateKey(d = new Date()) {
  // YYYY-MM-DD in UTC for consistent keys.
  return d.toISOString().slice(0, 10);
}

export function PulseTwinProvider({ children }) {
  const [bodyTwin, setBodyTwin] = useState(defaultBodyTwin);
  const [nutritionLogs, setNutritionLogs] = useState({}); // { [dateKey]: Entry[] }

  // Keep Body Twin dailyNutrition in sync with logged meals for today.
  useEffect(() => {
    const dateKey = getDateKey();
    const entries = nutritionLogs?.[dateKey] || [];

    const totals = entries.reduce(
      (acc, e) => {
        acc.calories += Number(e.calories || 0);
        acc.protein += Number(e.protein || 0);
        acc.carbs += Number(e.carbs || 0);
        acc.fat += Number(e.fat || 0);
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    setBodyTwin((prev) => ({
      ...prev,
      dailyNutrition: {
        calories: totals.calories || null,
        protein: totals.protein || null,
        carbs: totals.carbs || null,
        fat: totals.fat || null
      }
    }));
  }, [nutritionLogs]);

  const value = useMemo(
    () => ({
      bodyTwin,
      setBodyTwin,
      nutritionLogs,
      addNutritionLogEntry: (dateKey, entry) => {
        setNutritionLogs((prev) => {
          const current = prev?.[dateKey] || [];
          return {
            ...prev,
            [dateKey]: [...current, entry]
          };
        });
      },
      getNutritionLogEntriesForDate: (dateKey) => nutritionLogs?.[dateKey] || []
    }),
    [bodyTwin, nutritionLogs]
  );

  return (
    <PulseTwinContext.Provider value={value}>
      {children}
    </PulseTwinContext.Provider>
  );
}

export function usePulseTwin() {
  const ctx = useContext(PulseTwinContext);
  if (!ctx) throw new Error('usePulseTwin must be used within PulseTwinProvider');
  return ctx;
}

