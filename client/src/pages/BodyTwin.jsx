import { useMemo, useState } from 'react';
import BodyTwinRing from '../components/BodyTwinRing.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function AvatarCard({ title, subtitle, imageDataUrl, fallbackText, loading = false }) {
  return (
    <div className="pt-card p-5">
      <div className="pt-label">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
        {loading ? (
          <div className="flex h-80 items-center justify-center p-5 text-center text-sm text-zinc-500">
            Generating avatar...
          </div>
        ) : imageDataUrl ? (
          <img src={imageDataUrl} alt={title} className="h-80 w-full object-cover" />
        ) : (
          <div className="flex h-80 items-center justify-center p-5 text-center text-sm text-zinc-500">
            {fallbackText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BodyTwin() {
  const { bodyTwin, setBodyTwin } = usePulseTwin();

  const [weightKg, setWeightKg] = useState(Number(bodyTwin?.bodyStats?.weightKg ?? 70));
  const [bodyType, setBodyType] = useState('average');
  const [simulationScore, setSimulationScore] = useState(0);
  const [horizonDays, setHorizonDays] = useState(30);
  const [currentAvatar, setCurrentAvatar] = useState(null);
  const [futureAvatar, setFutureAvatar] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  const weightInvalid = !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250;

  const predicted = useMemo(() => {
    const h = horizonDays / 30;
    const baseFatByType = bodyType === 'slim' ? 16 : bodyType === 'broad' ? 28 : 22;
    const baseFitnessByType = bodyType === 'slim' ? 6 : bodyType === 'broad' ? 4 : 5;
    const fatDrop = simulationScore * 0.28 * h + (baseFitnessByType - 5) * 0.08 * h;
    const predictedBodyFat = clamp(Number((baseFatByType - fatDrop).toFixed(1)), 8, 45);
    const predictedWeight = clamp(Number((weightKg - simulationScore * 0.07 * h).toFixed(1)), 35, 180);
    const projectedFitness = clamp(baseFitnessByType + Math.round((simulationScore / 4) * h), 1, 10);
    return { bodyFatPct: predictedBodyFat, weightKg: predictedWeight, fitnessLevel: projectedFitness };
  }, [bodyType, weightKg, simulationScore, horizonDays]);

  const friendlySummary = useMemo(() => {
    const direction = simulationScore >= 0 ? 'improving' : 'slowing down';
    return `Your trend looks ${direction}. In ${horizonDays} days, you can move toward ${predicted.weightKg} kg with consistent daily habits.`;
  }, [simulationScore, horizonDays, predicted.weightKg]);

  const generateAvatars = async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const req = async (target) => fetch(`${baseUrl}/api/body-twin/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: target === 'future' ? 'future-avatar' : 'current-avatar',
          style: 'realistic 3d fitness avatar, app UI render',
          genderStyle: 'neutral',
          bodyShape: target === 'future' ? (predicted.bodyFatPct <= 16 ? 'lean athletic' : predicted.bodyFatPct <= 24 ? 'average fit' : 'broad') : bodyType,
          fitnessLevel: target === 'future' ? predicted.fitnessLevel : bodyType === 'slim' ? 6 : bodyType === 'broad' ? 4 : 5,
          vibe: target === 'future' ? 'confident, healthy progress' : 'natural, authentic'
        })
      });

      const [currentResp, futureResp] = await Promise.all([req('current'), req('future')]);
      const currentJson = await currentResp.json().catch(() => null);
      const futureJson = await futureResp.json().catch(() => null);
      if (!currentResp.ok) throw new Error(currentJson?.message || 'Failed to generate current avatar');
      if (!futureResp.ok) throw new Error(futureJson?.message || 'Failed to generate future avatar');
      setCurrentAvatar(currentJson?.data?.imageDataUrl || null);
      setFutureAvatar(futureJson?.data?.imageDataUrl || null);
    } catch (e) {
      setAvatarError(e?.message || 'Avatar generation failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveToBodyTwin = () => {
    const baseFatByType = bodyType === 'slim' ? 16 : bodyType === 'broad' ? 28 : 22;
    setBodyTwin((prev) => ({
      ...prev,
      bodyStats: {
        ...prev.bodyStats,
        weightKg,
        bodyFatPct: baseFatByType
      },
      updatedAt: new Date().toISOString()
    }));
  };

  const chipBase =
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors';
  const chipInactive =
    'border-white/10 bg-black/30 text-fit-muted hover:border-white/15 hover:bg-white/5';
  const chipActive = 'border-fit-lime bg-fit-lime text-white';

  return (
    <div className="pt-page">
      <div className="pt-container max-w-4xl">
        <div className="pt-label">Body Twin</div>
        <h1 className="mt-1 pt-title">Your Body Twin</h1>
        <p className="mt-2 text-sm text-zinc-400">Minimal setup, instant preview.</p>

        <div className="mt-8 space-y-6">
          <div className="pt-card p-5 sm:p-6">
            <div className="text-sm font-semibold text-zinc-100">Quick setup</div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">Body type</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['slim', 'average', 'broad'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBodyType(t)}
                      className={`${chipBase} ${bodyType === t ? chipActive : chipInactive}`}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">Current weight (kg)</span>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="pt-input"
                />
                {weightInvalid ? (
                  <span className="mt-1 block text-xs text-red-400">Enter a valid weight (30-250).</span>
                ) : null}
              </label>
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-zinc-500">Preview timeline</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[30, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setHorizonDays(d)}
                      className={`${chipBase} ${horizonDays === d ? chipActive : chipInactive}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  saveToBodyTwin();
                  generateAvatars();
                }}
                className="pt-btn-primary md:col-span-2"
                disabled={avatarBusy || weightInvalid}
              >
                {avatarBusy ? 'Generating...' : 'Generate My Twin'}
              </button>
            </div>
          </div>

          <div className="pt-card p-5 sm:p-6">
            <div className="text-sm font-semibold text-zinc-100">Your result</div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <AvatarCard
                title="Current"
                subtitle={`${weightKg} kg · ${bodyType} build`}
                imageDataUrl={currentAvatar}
                fallbackText="Tap Generate My Twin above"
                loading={avatarBusy}
              />
              <AvatarCard
                title="Projected"
                subtitle={`${predicted.weightKg} kg · ${predicted.bodyFatPct}% fat · ${predicted.fitnessLevel}/10 fitness`}
                imageDataUrl={futureAvatar}
                fallbackText="Future avatar will appear here"
                loading={avatarBusy}
              />
            </div>
            {avatarError ? <div className="mt-3 text-sm text-red-400">{avatarError}</div> : null}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-relaxed text-zinc-300">
            {friendlySummary}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BodyTwinRing label="Mood score" value={bodyTwin?.mood?.moodScore ?? '-'} accent="purple" />
            <BodyTwinRing label="Recovery score" value={bodyTwin?.recoveryScore ?? '-'} accent="cyan" />
          </div>
        </div>
      </div>
    </div>
  );
}
