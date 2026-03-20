import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';
import { useAuth } from '../state/AuthProvider.jsx';
import { db } from '../lib/firebase.js';

export default function VoiceCheckin() {
  const { setBodyTwin } = usePulseTwin();
  const { user } = useAuth();

  const baseUrl = useMemo(() => import.meta.env.VITE_API_BASE_URL, []);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [transcript, setTranscript] = useState('');
  const [moodScore, setMoodScore] = useState(null);
  const [energyLevel, setEnergyLevel] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [recoveryScore, setRecoveryScore] = useState(null);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, [previewUrl]);

  const startRecording = async () => {
    setError(null);
    setTranscript('');
    setMoodScore(null);
    setEnergyLevel(null);
    setComplaints([]);
    setRecoveryScore(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      };

      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(e?.message || 'Could not start recording');
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

  const submitCheckin = async () => {
    if (!audioBlob) return;
    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('audio', audioBlob, 'voice.webm');

      const resp = await fetch(`${baseUrl}/api/voice/transcribe`, {
        method: 'POST',
        body: form
      });

      if (!resp.ok) {
        let message = 'Failed to transcribe voice';
        try {
          const errJson = await resp.json();
          message = errJson?.message || message;
        } catch {
          // ignore
        }
        window.dispatchEvent(
          new CustomEvent('pulse-toast', { detail: { type: 'error', message } })
        );
        return;
      }

      const json = await resp.json();
      const data = json?.data || {};

      setTranscript(data.transcript || '');
      setMoodScore(data.moodScore ?? null);
      setEnergyLevel(data.energyLevel ?? null);
      setComplaints(Array.isArray(data.complaints) ? data.complaints : []);
      setRecoveryScore(data.recoveryScore ?? null);

      setBodyTwin((prev) => ({
        ...prev,
        mood: {
          ...prev.mood,
          moodScore: data.moodScore ?? prev.mood.moodScore ?? null,
          energyLevel: data.energyLevel ?? prev.mood.energyLevel ?? null,
          physicalComplaints:
            Array.isArray(data.complaints) ? data.complaints : prev.mood.physicalComplaints
        },
        recoveryScore: data.recoveryScore ?? prev.recoveryScore ?? null,
        updatedAt: new Date().toISOString()
      }));

      // Persist check-in history for timeline/review across reloads.
      if (!user?.uid) {
        throw new Error('Firebase user missing. Anonymous auth may be disabled.');
      }

      await addDoc(collection(db, 'users', user.uid, 'voiceCheckins'), {
        transcript: data.transcript || '',
        moodScore: data.moodScore ?? null,
        energyLevel: data.energyLevel ?? null,
        complaints: Array.isArray(data.complaints) ? data.complaints : [],
        recoveryScore: data.recoveryScore ?? null,
        createdAt: serverTimestamp(),
        source: 'voice-checkin'
      });
    } catch (e) {
      const msg = e?.message || 'Voice check-in failed';
      setError(msg);
      window.dispatchEvent(new CustomEvent('pulse-toast', { detail: { type: 'error', message: msg } }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-page">
      <div className="pt-container-narrow">
        <div className="pt-label">Voice Check-in</div>
        <h1 className="mt-1 pt-title">How do you feel?</h1>

        <div className="mt-8 pt-card p-6 sm:p-8">
          <p className="text-sm text-zinc-400">
            Record a short voice note. We&apos;ll transcribe with Whisper and extract mood and recovery.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="pt-btn-secondary px-5"
                disabled={busy}
              >
                Start recording
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="pt-btn-danger px-5"
                disabled={busy}
              >
                Stop recording
              </button>
            )}

            <button
              type="button"
              onClick={submitCheckin}
              className="pt-btn-primary w-full sm:w-auto sm:min-w-[8rem]"
              disabled={!audioBlob || busy}
            >
              {busy ? 'Analyzing...' : 'Submit'}
            </button>
          </div>

          {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

          {previewUrl ? (
            <div className="mt-6">
              <div className="text-xs font-medium text-zinc-500">Recording preview</div>
              <audio controls src={previewUrl} className="mt-2 w-full rounded-xl" />
            </div>
          ) : null}
        </div>

        {transcript ? (
          <div className="mt-6 pt-card p-6 sm:p-8">
            <div className="text-sm font-semibold text-zinc-100">Transcript</div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
              {transcript}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="text-xs font-medium text-zinc-500">Mood score</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
                  {moodScore ?? '-'}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="text-xs font-medium text-zinc-500">Recovery score</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
                  {recoveryScore ?? '-'}
                </div>
              </div>
              <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="text-xs font-medium text-zinc-500">Energy level</div>
                <div className="mt-1 text-sm text-zinc-300">{energyLevel ?? '-'}</div>
              </div>
              <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="text-xs font-medium text-zinc-500">Complaints</div>
                <div className="mt-2 text-sm text-zinc-300">
                  {complaints?.length ? complaints.join(', ') : '-'}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
