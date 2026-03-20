import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseCard from '../components/ExerciseCard.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

const TAGS = [
  { key: 'knee', label: 'Knee pain' },
  { key: 'lowback', label: 'Lower back pain' },
  { key: 'shoulder', label: 'Shoulder pain' },
  { key: 'wrist', label: 'Wrist pain' },
  { key: 'impact', label: 'Impact / jump avoided' },
  { key: 'pain', label: 'General soreness / pain' }
];

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInjuryFlags(text) {
  const t = normalizeText(text);
  return {
    knee: /\bknee\b|patella|meniscus|shin|knees/.test(t),
    lowback: /\bback\b|lower back|lumb|sciatic|tailbone/.test(t),
    shoulder: /\bshoulder\b|rotator|bicep|imping|arm pain/.test(t),
    wrist: /\bwrist\b|carpal|hand pain/.test(t),
    impact: /\bjump\b|impact|stairs|aggrav/.test(t),
    pain: /\bpain\b|sore|ache/.test(t)
  };
}

function difficultyFromRecovery(recoveryScore) {
  const r = Number(recoveryScore ?? 5);
  if (r <= 3)
    return {
      level: 'Low',
      color: 'bg-fit-rose',
      sets: 2,
      repMult: 0.8,
      holdMult: 0.8,
      cardioMult: 0.8
    };
  if (r >= 7)
    return {
      level: 'High',
      color: 'bg-fit-lime',
      sets: 4,
      repMult: 1.1,
      holdMult: 1.1,
      cardioMult: 1.1
    };
  return {
    level: 'Medium',
    color: 'bg-fit-cyan',
    sets: 3,
    repMult: 1,
    holdMult: 1,
    cardioMult: 1
  };
}

function buildWorkoutPlan({ bodyTwin, injuryFlags }) {
  const goal = bodyTwin?.fitnessGoal?.type || 'fat_loss';
  const recovery = difficultyFromRecovery(bodyTwin?.recoveryScore);
  const affordableMode = Boolean(bodyTwin?.affordableMode);
  const equipmentAvailable = bodyTwin?.equipmentAvailable || 'none';

  const rep = (n) => Math.max(5, Math.round(n * recovery.repMult));
  const hold = (n) => Math.max(20, Math.round(n * recovery.holdMult));
  const cardio = (n) => Math.max(15, Math.round(n * recovery.cardioMult));

  const equipmentMode = !affordableMode && equipmentAvailable === 'gym' ? 'gym' : 'bodyweight';

  const baseTypes = (() => {
    if (goal === 'muscle_gain') return ['squat', 'push', 'lunge', 'core', 'cardio'];
    if (goal === 'endurance') return ['cardio', 'push', 'lunge', 'core', 'squat'];
    return ['squat', 'push', 'lunge', 'cardio', 'core'];
  })();

  const cardioBlocked = injuryFlags.impact || injuryFlags.lowback || injuryFlags.pain;

  const mapTypeToExercise = (type) => {
    if (equipmentMode === 'gym') {
      switch (type) {
        case 'squat':
          return { key: 'goblet_squat', name: 'Goblet Squat' };
        case 'push':
          return { key: 'db_chest_press', name: 'Dumbbell Chest Press' };
        case 'lunge':
          return { key: 'walking_lunge', name: 'Walking Lunges' };
        case 'cardio':
          return { key: 'bike', name: 'Stationary Bike' };
        case 'core':
          return { key: 'hanging_leg_raises', name: 'Hanging Leg Raises' };
        default:
          return { key: type, name: type };
      }
    }

    switch (type) {
      case 'squat':
        return { key: 'squats', name: 'Squats' };
      case 'push':
        return { key: 'pushups', name: 'Pushups' };
      case 'lunge':
        return { key: 'lunges', name: 'Lunges' };
      case 'cardio':
        return { key: 'jacks', name: 'Jumping Jacks' };
      case 'core':
        return { key: 'planks', name: 'Planks' };
      default:
        return { key: type, name: type };
    }
  };

  const plan = baseTypes.map((baseType) => {
    const baseEx = mapTypeToExercise(baseType);

    // Injury-driven replacements (and show why).
    if (injuryFlags.knee) {
      if (baseType === 'squat') {
        const seconds = 45;
        return {
          key: 'glute_bridges',
          name: 'Glute Bridges',
          details: `${recovery.sets} sets x ${rep(12)} reps`,
          why: `Knee pain detected → ${baseEx.name} → Glute Bridges`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
      if (baseType === 'lunge') {
        const seconds = 45;
        return {
          key: 'hamstring_bridges',
          name: 'Hamstring Bridges',
          details: `${recovery.sets} sets x ${rep(12)} reps (controlled)`,
          why: `Knee pain detected → ${baseEx.name} → Hamstring Bridges`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
    }

    if (injuryFlags.lowback) {
      if (baseType === 'core') {
        const seconds = 50;
        return {
          key: 'dead_bugs',
          name: 'Dead Bugs',
          details: `${recovery.sets} sets x ${rep(10)} reps (slow)`,
          why: `Lower back pain detected → ${baseEx.name} → Dead Bugs`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
      if (baseType === 'cardio') {
        const seconds = cardio(30);
        return {
          key: 'marching_in_place',
          name: 'Marching In Place',
          details: `${recovery.sets} sets x ${seconds} seconds`,
          why: `Lower back pain detected → ${baseEx.name} → Marching In Place`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
    }

    if (injuryFlags.shoulder && baseType === 'push') {
      const seconds = 45;
      return {
        key: 'incline_pushups',
        name: 'Incline Pushups',
        details: `${recovery.sets} sets x ${rep(10)} reps`,
        why: `Shoulder pain detected → ${baseEx.name} → Incline Pushups`,
        sets: recovery.sets,
        setSeconds: seconds
      };
    }

    if (injuryFlags.wrist) {
      if (baseType === 'push') {
        const seconds = 45;
        return {
          key: 'wall_pushups',
          name: 'Wall Pushups',
          details: `${recovery.sets} sets x ${rep(12)} reps`,
          why: `Wrist pain detected → ${baseEx.name} → Wall Pushups`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
      if (baseType === 'core') {
        const seconds = hold(45);
        return {
          key: 'forearm_plank',
          name: 'Forearm Plank',
          details: `${recovery.sets} sets x ${seconds} seconds`,
          why: `Wrist pain detected → ${baseEx.name} → Forearm Plank`,
          sets: recovery.sets,
          setSeconds: seconds
        };
      }
    }

    if (cardioBlocked && baseType === 'cardio') {
      const seconds = cardio(30);
      return {
        key: 'marching_in_place2',
        name: 'Marching In Place',
        details: `${recovery.sets} sets x ${seconds} seconds`,
        why: `Impact / soreness detected → ${baseEx.name} → Marching In Place`,
        sets: recovery.sets,
        setSeconds: seconds
      };
    }

    // Defaults when not replaced.
    if (baseType === 'squat') {
      return {
        ...baseEx,
        details: `${recovery.sets} sets x ${rep(10)} reps`,
        sets: recovery.sets,
        setSeconds: 45
      };
    }
    if (baseType === 'lunge') {
      return {
        ...baseEx,
        details: `${recovery.sets} sets x ${rep(10)} reps (controlled)`,
        sets: recovery.sets,
        setSeconds: 45
      };
    }
    if (baseType === 'push') {
      return {
        ...baseEx,
        details: `${recovery.sets} sets x ${rep(8)} reps`,
        sets: recovery.sets,
        setSeconds: 45
      };
    }
    if (baseType === 'cardio') {
      const seconds = cardio(30);
      return {
        ...baseEx,
        details: `${recovery.sets} sets x ${seconds} seconds`,
        sets: recovery.sets,
        setSeconds: seconds
      };
    }
    if (baseType === 'core') {
      const seconds = hold(45);
      return {
        ...baseEx,
        details: `${recovery.sets} sets x ${seconds} seconds`,
        sets: recovery.sets,
        setSeconds: seconds
      };
    }

    return { ...baseEx, details: `${recovery.sets} sets`, why: '', sets: recovery.sets, setSeconds: 45 };
  });

  return plan.slice(0, 5);
}

export default function WorkoutPlan() {
  const { bodyTwin, setBodyTwin } = usePulseTwin();
  const [done, setDone] = useState({});
  const [customInjuryNotes, setCustomInjuryNotes] = useState('');
  const [appliedFlags, setAppliedFlags] = useState(() => parseInjuryFlags(''));

  const voiceInjuries = useMemo(() => {
    const arr = Array.isArray(bodyTwin?.mood?.physicalComplaints)
      ? bodyTwin.mood.physicalComplaints
      : [];
    return arr.join(', ');
  }, [bodyTwin]);

  const voiceFlags = useMemo(() => parseInjuryFlags(voiceInjuries), [voiceInjuries]);
  const customFlags = useMemo(() => parseInjuryFlags(customInjuryNotes), [customInjuryNotes]);

  useEffect(() => {
    // Start from voice-derived flags; user can override via chips + Apply.
    setAppliedFlags({ ...voiceFlags });
  }, [voiceFlags]);

  const mergedFlags = useMemo(
    () => ({ ...voiceFlags, ...appliedFlags }),
    [voiceFlags, appliedFlags]
  );

  const injuriesSelectedText = useMemo(() => {
    const selected = TAGS.filter((t) => mergedFlags[t.key]);
    return selected.map((t) => t.label).join(', ');
  }, [mergedFlags]);

  const recovery = useMemo(() => difficultyFromRecovery(bodyTwin?.recoveryScore), [bodyTwin]);

  const plan = useMemo(
    () => buildWorkoutPlan({ bodyTwin, injuryFlags: mergedFlags }),
    [bodyTwin, mergedFlags]
  );

  const allDone = plan.length > 0 && plan.every((ex) => Boolean(done[ex.key]));

  // Timer (simple: one running timer at a time).
  const intervalRef = useRef(null);
  const [timer, setTimer] = useState({
    key: null,
    running: false,
    remainingSec: 0,
    setIndex: 0
  });

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const planMap = useMemo(() => {
    const m = new Map();
    for (const ex of plan) m.set(ex.key, ex);
    return m;
  }, [plan]);

  const startTimerFor = (ex) => {
    if (!ex || done[ex.key]) return;
    if (timer.running) return;

    setTimer({ key: ex.key, running: true, remainingSec: ex.setSeconds, setIndex: 0 });

    intervalRef.current = setInterval(() => {
      setTimer((prev) => {
        if (!prev.running || prev.key !== ex.key) return prev;

        const nextRemaining = prev.remainingSec - 1;
        if (nextRemaining > 0) return { ...prev, remainingSec: nextRemaining };

        const exFromMap = planMap.get(ex.key);
        if (!exFromMap) return { key: null, running: false, remainingSec: 0, setIndex: 0 };

        const nextSetIndex = prev.setIndex + 1;
        if (nextSetIndex >= (exFromMap.sets || 1)) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setDone((d) => ({ ...d, [exFromMap.key]: true }));
          return { key: null, running: false, remainingSec: 0, setIndex: 0 };
        }

        return { ...prev, remainingSec: exFromMap.setSeconds, setIndex: nextSetIndex };
      });
    }, 1000);
  };

  const timerUIFor = (ex) => {
    const isDone = Boolean(done[ex.key]);
    const isRunningThis = timer.running && timer.key === ex.key;

    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-fit-muted">
          {isDone
            ? 'Completed'
            : isRunningThis
              ? `Set ${timer.setIndex + 1}/${ex.sets} • ${timer.remainingSec}s`
              : `Set timer: ${ex.setSeconds}s`}
        </div>
        {isDone ? null : (
          <button
            type="button"
            onClick={() => startTimerFor(ex)}
            disabled={timer.running}
            className="shrink-0 pt-btn-secondary px-3 py-2 text-xs"
          >
            Start set
          </button>
        )}
      </div>
    );
  };

  const toggleChip = (key) => {
    setAppliedFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyCustomInjuries = () => {
    setAppliedFlags((prev) => ({ ...prev, ...customFlags }));
  };

  return (
    <div className="pt-page">
      <div className="pt-container-md">
        <div className="pt-label">Workout Plan</div>
        <h1 className="mt-1 pt-title">Today&apos;s session</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="pt-card p-5 text-sm text-fit-muted">
            Goal:{' '}
            <span className="font-medium text-white">{bodyTwin?.fitnessGoal?.type || 'fat_loss'}</span>
            . Recovery:{' '}
            <span className="font-medium tabular-nums text-white">{bodyTwin?.recoveryScore ?? '-'}</span>.
          </div>

          <div className="pt-card p-5 text-sm text-fit-muted">
            Difficulty: <span className="font-medium text-white">{recovery.level}</span>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/50">
              <div
                className={`h-2 rounded-full ${recovery.color}`}
                style={{
                  width: recovery.level === 'Low' ? '33%' : recovery.level === 'Medium' ? '66%' : '100%'
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-card p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">Injury tags</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const selected = Boolean(mergedFlags[t.key]);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleChip(t.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-fit-lime bg-fit-lime text-white'
                      : 'border-white/10 bg-black/30 text-fit-muted hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-fit-muted">
                Add/override injury keywords (optional)
              </label>
              <input
                value={customInjuryNotes}
                onChange={(e) => setCustomInjuryNotes(e.target.value)}
                className="pt-input"
                placeholder="e.g. knee pain, lower back ache..."
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={applyCustomInjuries}
                className="pt-btn-secondary w-full"
                disabled={!customInjuryNotes.trim()}
              >
                Apply
              </button>
            </div>
          </div>

          {injuriesSelectedText ? (
            <div className="mt-4 text-xs text-fit-muted">Using: {injuriesSelectedText}</div>
          ) : (
            <div className="mt-4 text-xs text-fit-muted">No injury tags detected.</div>
          )}

          <div className="mt-4 text-xs text-fit-muted">
            Equipment mode:{' '}
            {bodyTwin?.affordableMode ? 'Affordable (bodyweight)' : bodyTwin?.equipmentAvailable || 'bodyweight'}.
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {plan.map((ex) => {
            const isDone = Boolean(done[ex.key]);
            const isActive = timer.running && timer.key === ex.key;
            return (
              <ExerciseCard
                key={ex.key}
                name={ex.name}
                details={ex.details}
                why={ex.why}
                timer={timerUIFor(ex)}
                active={isActive}
                completed={isDone}
                onDone={
                  done[ex.key]
                    ? undefined
                    : () => setDone((d) => ({ ...d, [ex.key]: true }))
                }
              />
            );
          })}
        </div>

        <div className="mt-8 pt-card p-5 text-sm text-fit-muted">
          {allDone ? (
            <button
              type="button"
              onClick={() => {
                setBodyTwin((prev) => ({
                  ...prev,
                  workoutHistory: {
                    streakDays: (prev.workoutHistory?.streakDays || 0) + 1,
                    lastWorkoutAt: new Date().toISOString()
                  },
                  updatedAt: new Date().toISOString()
                }));
              }}
              className="pt-btn-primary w-full sm:w-auto"
            >
              Confirm workout completed
            </button>
          ) : (
            'Start the set timers, then mark/confirm completion.'
          )}
        </div>
      </div>
    </div>
  );
}

