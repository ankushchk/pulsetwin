import { useEffect, useMemo, useRef, useState } from 'react';
import StatCard from '../components/StatCard.jsx';
import BodyTwinRing from '../components/BodyTwinRing.jsx';
import MacroBreakdown from '../components/MacroBreakdown.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';

function getWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { bodyTwin, nutritionLogs, setBodyTwin } = usePulseTwin();
  const baseUrl = useMemo(() => import.meta.env.VITE_API_BASE_URL, []);

  const calories = bodyTwin?.dailyNutrition?.calories;
  const protein = bodyTwin?.dailyNutrition?.protein;
  const carbs = bodyTwin?.dailyNutrition?.carbs;
  const fat = bodyTwin?.dailyNutrition?.fat;
  const mood = bodyTwin?.mood?.moodScore;
  const recovery = bodyTwin?.recoveryScore;
  const goal = bodyTwin?.fitnessGoal?.type || 'fat_loss';
  const budget = bodyTwin?.budget?.dailyFoodBudgetRupees ?? '-';

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [agentResult, setAgentResult] = useState(null);
  const [agentError, setAgentError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setAgentError(null);
    setAgentResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob);
      };
      recorder.start();
      setRecording(true);
    } catch (e) {
      setAgentError(e?.message || 'Could not start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  };

  const runVoiceAgent = async () => {
    if (!audioBlob || !user?.uid) return;
    setBusy(true);
    setAgentError(null);
    try {
      const form = new FormData();
      form.append('audio', audioBlob, 'voice-command.webm');

      const transcribeResp = await fetch(`${baseUrl}/api/voice/transcribe`, {
        method: 'POST',
        body: form
      });
      const transcribeJson = await transcribeResp.json().catch(() => null);
      if (!transcribeResp.ok) {
        throw new Error(transcribeJson?.message || 'Failed to transcribe command');
      }

      const voiceData = transcribeJson?.data || {};
      // Keep Body Twin synced with latest voice signal.
      setBodyTwin((prev) => ({
        ...prev,
        mood: {
          ...prev.mood,
          moodScore: voiceData.moodScore ?? prev.mood.moodScore ?? null,
          energyLevel: voiceData.energyLevel ?? prev.mood.energyLevel ?? null,
          physicalComplaints:
            Array.isArray(voiceData.complaints) ? voiceData.complaints : prev.mood.physicalComplaints
        },
        recoveryScore: voiceData.recoveryScore ?? prev.recoveryScore ?? null,
        updatedAt: new Date().toISOString()
      }));

      const cmdResp = await fetch(`${baseUrl}/api/agent/voice-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: voiceData.transcript || '',
          userId: user.uid,
          weekId: getWeekId(),
          bodyTwin: {
            ...bodyTwin,
            mood: {
              ...bodyTwin?.mood,
              moodScore: voiceData.moodScore ?? bodyTwin?.mood?.moodScore ?? null,
              energyLevel: voiceData.energyLevel ?? bodyTwin?.mood?.energyLevel ?? null,
              physicalComplaints: Array.isArray(voiceData.complaints)
                ? voiceData.complaints
                : bodyTwin?.mood?.physicalComplaints || []
            },
            recoveryScore: voiceData.recoveryScore ?? bodyTwin?.recoveryScore ?? null
          },
          nutritionLogs
        })
      });
      const cmdJson = await cmdResp.json().catch(() => null);
      if (!cmdResp.ok) throw new Error(cmdJson?.message || 'Voice command failed');

      const result = cmdJson?.data || null;
      setAgentResult(result);
      if (result?.navigateTo) {
        setTimeout(() => navigate(result.navigateTo), 700);
      }
    } catch (e) {
      setAgentError(e?.message || 'Voice agent failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-page">
      <div className="pt-container">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="pt-label">Today</div>
            <h1 className="mt-1 pt-title">Dashboard</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-fit-surface px-4 py-2 text-xs text-fit-muted">
            Goal: <span className="font-medium text-zinc-100">{goal}</span> • Budget:{' '}
            <span className="font-medium text-zinc-100">{budget === '-' ? '-' : `Rs ${budget}`}</span>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="pt-label">Daily coach insight</p>
              <p className="mt-2 text-base text-zinc-300">
                {recovery != null
                  ? `Recovery is ${recovery}/10 and mood is ${mood ?? '-'}/10. Today’s workout should adapt to your latest voice check-in.`
                  : 'Record a voice check-in to personalize today’s workout intensity and recovery guidance.'}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[220px]">
              <Link to="/voice" className="pt-btn-secondary px-4 py-2 text-center text-xs">
                Voice check-in
              </Link>
              <Link to="/workout" className="pt-btn-primary px-4 py-2 text-center text-xs">
                Open workout plan
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <BodyTwinRing label="Recovery score" value={bodyTwin?.recoveryScore ?? '-'} accent="cyan" />
          <StatCard title="Calories" value={calories ?? '-'} accent="rose" />
          <StatCard title="Mood (1-10)" value={bodyTwin?.mood?.moodScore ?? '-'} accent="purple" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MacroBreakdown macros={{ protein, carbs, fat }} />
          <div className="pt-card p-5">
            <div className="text-sm font-semibold text-white">Voice coach agent</div>
            <div className="mt-4 grid gap-2">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={busy}
                  className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-left text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800/80 disabled:opacity-50"
                >
                  Start voice command
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={busy}
                  className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-left text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800/80 disabled:opacity-50"
                >
                  Stop recording
                </button>
              )}

              <button
                type="button"
                onClick={runVoiceAgent}
                disabled={!audioBlob || busy || !user?.uid}
                className="pt-btn-primary w-full disabled:opacity-50"
              >
                {busy ? 'Running agent...' : 'Run voice agent'}
              </button>
              <div className="text-xs text-zinc-500">
                Try: “generate my workout”, “create grocery list”, “show recovery summary”
              </div>
              {agentResult?.message ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-300">
                  {agentResult?.transcript ? (
                    <div className="mb-1 text-zinc-500">
                      Heard: <span className="text-zinc-300">{agentResult.transcript}</span>
                    </div>
                  ) : null}
                  {agentResult.message}
                </div>
              ) : null}
              {agentError ? (
                <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
                  {agentError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
