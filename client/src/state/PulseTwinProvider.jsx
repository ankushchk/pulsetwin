import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { defaultBodyTwin } from '../../../shared/bodyTwinDefaults.js';
import { db } from '../lib/firebase.js';
import { useAuth } from './AuthProvider.jsx';

const PulseTwinContext = createContext(null);

function getDateKey(d = new Date()) {
  // YYYY-MM-DD in UTC for consistent keys.
  return d.toISOString().slice(0, 10);
}

function mergeBodyTwinFromCloud(raw) {
  const next = raw && typeof raw === 'object' ? raw : {};
  return {
    ...defaultBodyTwin,
    ...next,
    bodyStats: { ...defaultBodyTwin.bodyStats, ...(next.bodyStats || {}) },
    fitnessGoal: { ...defaultBodyTwin.fitnessGoal, ...(next.fitnessGoal || {}) },
    dailyNutrition: { ...defaultBodyTwin.dailyNutrition, ...(next.dailyNutrition || {}) },
    mood: { ...defaultBodyTwin.mood, ...(next.mood || {}) },
    workoutHistory: { ...defaultBodyTwin.workoutHistory, ...(next.workoutHistory || {}) },
    budget: { ...defaultBodyTwin.budget, ...(next.budget || {}) }
  };
}

export function PulseTwinProvider({ children }) {
  const { user, authLoading } = useAuth();
  const [bodyTwin, setBodyTwin] = useState(defaultBodyTwin);
  const [nutritionLogs, setNutritionLogs] = useState({}); // { [dateKey]: Entry[] }
  const [hydratedFromCloud, setHydratedFromCloud] = useState(false);
  const [hydratedLogsFromCloud, setHydratedLogsFromCloud] = useState(false);

  // Hydrate Body Twin once auth is ready.
  useEffect(() => {
    let active = true;
    if (authLoading) return undefined;

    if (!user?.uid) {
      setHydratedFromCloud(true);
      setHydratedLogsFromCloud(true);
      return undefined;
    }

    const run = async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'bodyTwin', 'current');
        const snap = await getDoc(ref);
        if (!active) return;
        if (snap.exists()) {
          setBodyTwin(mergeBodyTwinFromCloud(snap.data()));
        }
      } catch (e) {
        // Show only once per load cycle to help hackathon debugging.
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: {
              type: 'error',
              message: `Firestore read error (Body Twin): ${e?.message || 'unknown error'}`
            }
          })
        );
        // eslint-disable-next-line no-console
        console.error('Firestore read error (Body Twin)', e);
      } finally {
        if (active) setHydratedFromCloud(true);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [authLoading, user?.uid]);

  // Hydrate meal logs once auth is ready.
  useEffect(() => {
    let active = true;
    if (authLoading) return undefined;

    if (!user?.uid) {
      setHydratedLogsFromCloud(true);
      return undefined;
    }

    const run = async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'nutritionLogs', 'current');
        const snap = await getDoc(ref);
        if (!active) return;
        if (snap.exists()) {
          const raw = snap.data()?.logs;
          if (raw && typeof raw === 'object') {
            setNutritionLogs(raw);
          }
        }
      } catch (e) {
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: {
              type: 'error',
              message: `Firestore read error (meal logs): ${e?.message || 'unknown error'}`
            }
          })
        );
        // eslint-disable-next-line no-console
        console.error('Firestore read error (meal logs)', e);
      } finally {
        if (active) setHydratedLogsFromCloud(true);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [authLoading, user?.uid]);

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

  // Persist Body Twin to Firestore for multi-device/reload continuity.
  useEffect(() => {
    if (authLoading || !user?.uid || !hydratedFromCloud) return;
    const ref = doc(db, 'users', user.uid, 'bodyTwin', 'current');
    setDoc(
      ref,
      {
        ...bodyTwin,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    ).catch((e) => {
      window.dispatchEvent(
        new CustomEvent('pulse-toast', {
          detail: {
            type: 'error',
            message: `Firestore write error (Body Twin): ${e?.message || 'unknown error'}`
          }
        })
      );
      // eslint-disable-next-line no-console
      console.error('Firestore write error (Body Twin)', e);
    });
  }, [authLoading, bodyTwin, hydratedFromCloud, user?.uid]);

  // Persist meal logs to Firestore for reload continuity.
  useEffect(() => {
    if (authLoading || !user?.uid || !hydratedLogsFromCloud) return;
    const ref = doc(db, 'users', user.uid, 'nutritionLogs', 'current');
    setDoc(
      ref,
      {
        logs: nutritionLogs,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    ).catch((e) => {
      window.dispatchEvent(
        new CustomEvent('pulse-toast', {
          detail: {
            type: 'error',
            message: `Firestore write error (meal logs): ${e?.message || 'unknown error'}`
          }
        })
      );
      // eslint-disable-next-line no-console
      console.error('Firestore write error (meal logs)', e);
    });
  }, [authLoading, hydratedLogsFromCloud, nutritionLogs, user?.uid]);

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

