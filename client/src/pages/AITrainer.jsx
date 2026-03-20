import { useEffect, useMemo, useRef, useState } from 'react';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const EXERCISES = [
  { key: 'squats', label: 'Squats' },
  { key: 'pushups', label: 'Pushups' },
  { key: 'lunges', label: 'Lunges' },
  { key: 'jacks', label: 'Jumping Jacks' },
  { key: 'planks', label: 'Planks' }
];

// Keep in sync with node_modules/@mediapipe/pose/package.json
const MEDIAPIPE_POSE_VERSION = '0.5.1675469404';
const MIN_VISIBILITY_FOR_REPS = 0.55;
const MAX_VERBOSE_LOGS = 3;

function isBrowserLikelySupported() {
  const ua = navigator.userAgent || '';
  // MediaPipe Pose is most stable on Chromium browsers in this project setup.
  return /Chrome|Chromium|Edg\//i.test(ua) && !/OPR\//i.test(ua);
}

function angle(a, b, c) {
  // Angle at point b for triangle a-b-c
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 180;

  const cos = dot / (magAB * magCB);
  const clamped = Math.max(-1, Math.min(1, cos));
  const rad = Math.acos(clamped);
  return (rad * 180) / Math.PI;
}

function getLm(landmarks, idx) {
  return landmarks?.[idx] || { x: 0, y: 0 };
}

export default function AITrainer() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const processingRef = useRef(false);
  const runningRef = useRef(false);
  const failuresRef = useRef(0);
  const poseFailedRef = useRef(false);
  const landmarkSeenRef = useRef(false);
  const noLandmarkTimeoutRef = useRef(null);
  const errorLogCountRef = useRef(0);
  const sendErrorCountRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('all'); // 'all' or one exercise key
  const [status, setStatus] = useState('Idle');
  const [landmarkFrames, setLandmarkFrames] = useState(0);
  const [counts, setCounts] = useState({
    squats: 0,
    pushups: 0,
    lunges: 0,
    jacks: 0,
    planks: 0
  });
  const countsRef = useRef({ ...counts });

  const repStateRef = useRef({
    squatDown: false,
    squatDepthFrames: 0,
    squatUpFrames: 0,
    pushDown: false,
    lungeDown: false,
    wasJackOpen: false,
    plankActive: false,
    lastRepAt: {
      squats: 0,
      pushups: 0,
      lunges: 0,
      jacks: 0,
      planks: 0
    }
  });

  const [flashKey, setFlashKey] = useState(null);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const activeKeys = useMemo(() => {
    if (mode === 'all') return new Set(EXERCISES.map((e) => e.key));
    return new Set([mode]);
  }, [mode]);

  const bumpRep = (key) => {
    countsRef.current[key] += 1;
    setCounts({ ...countsRef.current });
    setFlashKey(key);
    setTimeout(() => setFlashKey((prev) => (prev === key ? null : prev)), 500);
  };

  const updateFromLandmarks = (landmarks) => {
    if (!landmarks) return;
    const hasVisibility = (idx) => {
      const lm = landmarks?.[idx];
      return !lm || lm.visibility == null || lm.visibility >= MIN_VISIBILITY_FOR_REPS;
    };
    const stablePose =
      hasVisibility(11) &&
      hasVisibility(12) &&
      hasVisibility(23) &&
      hasVisibility(24) &&
      hasVisibility(25) &&
      hasVisibility(26) &&
      hasVisibility(27) &&
      hasVisibility(28);
    if (!stablePose) return;

    const repState = repStateRef.current;
    const now = performance.now();

    const lHip = getLm(landmarks, 23);
    const rHip = getLm(landmarks, 24);
    const lKnee = getLm(landmarks, 25);
    const rKnee = getLm(landmarks, 26);
    const lAnkle = getLm(landmarks, 27);
    const rAnkle = getLm(landmarks, 28);

    const lShoulder = getLm(landmarks, 11);
    const rShoulder = getLm(landmarks, 12);
    const lElbow = getLm(landmarks, 13);
    const rElbow = getLm(landmarks, 14);
    const lWrist = getLm(landmarks, 15);
    const rWrist = getLm(landmarks, 16);

    // Knee angles for squats/lunges.
    const leftKneeAngle = angle(lHip, lKnee, lAnkle);
    const rightKneeAngle = angle(rHip, rKnee, rAnkle);
    const minKneeAngle = Math.min(leftKneeAngle, rightKneeAngle);
    const maxKneeAngle = Math.max(leftKneeAngle, rightKneeAngle);

    // Elbow angles for pushups.
    const leftElbowAngle = angle(lShoulder, lElbow, lWrist);
    const rightElbowAngle = angle(rShoulder, rElbow, rWrist);
    const minElbowAngle = Math.min(leftElbowAngle, rightElbowAngle);
    const maxElbowAngle = Math.max(leftElbowAngle, rightElbowAngle);

    // Shared posture signals to reduce cross-exercise false positives.
    const leftHipLineAngle = angle(lShoulder, lHip, lAnkle);
    const rightHipLineAngle = angle(rShoulder, rHip, rAnkle);
    const bodyLineAngle = Math.min(leftHipLineAngle, rightHipLineAngle);
    const kneesStraight = leftKneeAngle > 155 && rightKneeAngle > 155;
    const avgShoulderY = (lShoulder.y + rShoulder.y) / 2;
    const avgHipY = (lHip.y + rHip.y) / 2;
    const avgKneeY = (lKnee.y + rKnee.y) / 2;
    const torsoNearlyHorizontal = Math.abs(avgShoulderY - avgHipY) < 0.2;
    const pushupReadyPose = kneesStraight && bodyLineAngle > 145 && torsoNearlyHorizontal;
    const hipKneeDelta = avgKneeY - avgHipY;
    const standingPose = hipKneeDelta > 0.08 && avgShoulderY < avgHipY;
    const floorPose =
      Math.abs(avgHipY - avgKneeY) < 0.12 && avgShoulderY >= avgHipY - 0.03;
    const shoulderDist = Math.abs(lShoulder.x - rShoulder.x);
    const armDist = Math.abs(lWrist.x - rWrist.x);
    const hipDist = Math.abs(lHip.x - rHip.x);
    const legDist = Math.abs(lAnkle.x - rAnkle.x);
    const armOpen = shoulderDist > 0.001 && armDist / shoulderDist > 1.35;
    const legOpen = hipDist > 0.001 && legDist / hipDist > 1.35;
    const wristsAboveShoulders = lWrist.y < lShoulder.y && rWrist.y < rShoulder.y;
    const jackOpen = standingPose && armOpen && legOpen && wristsAboveShoulders;

    // In "all" mode, count only one dominant movement to avoid cross-exercise increments.
    let activeInFrame = activeKeys;
    if (mode === 'all') {
      const candidates = [];
      if (standingPose && (minKneeAngle < 130 || repState.squatDown)) {
        candidates.push({ key: 'squats', score: 200 - minKneeAngle });
      }
      if (standingPose && Math.abs(leftKneeAngle - rightKneeAngle) > 18 && minKneeAngle < 125) {
        candidates.push({ key: 'lunges', score: 180 - minKneeAngle });
      }
      if (jackOpen || repState.wasJackOpen) {
        candidates.push({ key: 'jacks', score: 90 });
      }
      if (pushupReadyPose && floorPose) {
        candidates.push({ key: 'pushups', score: 170 - minElbowAngle });
      }
      if (kneesStraight && bodyLineAngle > 150 && floorPose) {
        candidates.push({ key: 'planks', score: 40 });
      }

      const chosen = candidates.sort((a, b) => b.score - a.score)[0]?.key || null;
      activeInFrame = new Set(chosen ? [chosen] : []);
    }

    // --- Squats ---
    if (activeInFrame.has('squats') && standingPose) {
      const bottom = 105;
      const top = 145;
      const deepByHeight = hipKneeDelta < 0.13;
      const standingTall = hipKneeDelta > 0.18;
      repState.squatDepthFrames =
        minKneeAngle < bottom || deepByHeight ? repState.squatDepthFrames + 1 : 0;
      repState.squatUpFrames =
        minKneeAngle > top || standingTall ? repState.squatUpFrames + 1 : 0;

      if (!repState.squatDown && repState.squatDepthFrames >= 2) {
        repState.squatDown = true;
      } else if (repState.squatDown && repState.squatUpFrames >= 2) {
        // debounce
        if (now - repState.lastRepAt.squats > 900) {
          repState.lastRepAt.squats = now;
          bumpRep('squats');
        }
        repState.squatDown = false;
        repState.squatDepthFrames = 0;
        repState.squatUpFrames = 0;
      }
    } else {
      repState.squatDown = false;
      repState.squatDepthFrames = 0;
      repState.squatUpFrames = 0;
    }

    // --- Pushups ---
    if (activeInFrame.has('pushups')) {
      const bottom = 90;
      const top = 150;
      if (pushupReadyPose && floorPose) {
        if (!repState.pushDown && minElbowAngle < bottom) {
          repState.pushDown = true;
        } else if (repState.pushDown && maxElbowAngle > top) {
          if (now - repState.lastRepAt.pushups > 350) {
            repState.lastRepAt.pushups = now;
            bumpRep('pushups');
          }
          repState.pushDown = false;
        }
      } else {
        // Reset transition state when user is not in pushup posture.
        repState.pushDown = false;
      }
    }

    // --- Lunges ---
    if (activeInFrame.has('lunges') && standingPose) {
      const bottom = 115;
      const top = 150;
      if (!repState.lungeDown && minKneeAngle < bottom) {
        repState.lungeDown = true;
      } else if (repState.lungeDown && maxKneeAngle > top) {
        if (now - repState.lastRepAt.lunges > 400) {
          repState.lastRepAt.lunges = now;
          bumpRep('lunges');
        }
        repState.lungeDown = false;
      }
    } else {
      repState.lungeDown = false;
    }

    // --- Jumping Jacks ---
    if (activeInFrame.has('jacks')) {
      if (jackOpen && !repState.wasJackOpen) {
        if (now - repState.lastRepAt.jacks > 700) {
          repState.lastRepAt.jacks = now;
          bumpRep('jacks');
        }
        repState.wasJackOpen = true;
      } else if (!jackOpen) {
        repState.wasJackOpen = false;
      }
    } else {
      repState.wasJackOpen = false;
    }

    // --- Planks ---
    if (activeInFrame.has('planks')) {
      const plankCriteria = kneesStraight && bodyLineAngle > 150;
      const validPlankPosture = plankCriteria && floorPose;

      if (validPlankPosture && !repState.plankActive) {
        if (now - repState.lastRepAt.planks > 800) {
          repState.lastRepAt.planks = now;
          bumpRep('planks');
        }
        repState.plankActive = true;
      } else if (!validPlankPosture) {
        repState.plankActive = false;
      }
    }
  };

  const start = async () => {
    if (runningRef.current) return;

    if (!isBrowserLikelySupported()) {
      setStatus('Browser may be unsupported for Pose (prefer Chrome/Edge)');
    }

    setStatus('Starting camera...');
    setLandmarkFrames(0);
    failuresRef.current = 0;
    poseFailedRef.current = false;
    landmarkSeenRef.current = false;
    errorLogCountRef.current = 0;
    sendErrorCountRef.current = 0;

    // reset
    countsRef.current = { squats: 0, pushups: 0, lunges: 0, jacks: 0, planks: 0 };
    setCounts(countsRef.current);
    setFlashKey(null);
    repStateRef.current = {
      squatDown: false,
      squatDepthFrames: 0,
      squatUpFrames: 0,
      pushDown: false,
      lungeDown: false,
      wasJackOpen: false,
      plankActive: false,
      lastRepAt: { squats: 0, pushups: 0, lunges: 0, jacks: 0, planks: 0 }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
    streamRef.current = stream;
    runningRef.current = true;
    setRunning(true);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await new Promise((resolve) => {
        const v = videoRef.current;
        const done = () => resolve();
        if (v.readyState >= 2 && v.videoWidth && v.videoHeight) return done();
        v.onloadedmetadata = done;
      });
      await videoRef.current.play();
    }

    setStatus('Checking pose model...');
    try {
      const modelUrl =
        '/third_party/mediapipe/modules/pose_landmark/pose_landmark_full.tflite';
      const modelResp = await fetch(modelUrl, { method: 'GET', cache: 'no-store' });
      if (!modelResp.ok) {
        throw new Error(`Model fetch failed: ${modelResp.status}`);
      }
    } catch {
      runningRef.current = false;
      setRunning(false);
      setStatus('Pose model not reachable (check /public path)');
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    setStatus('Loading MediaPipe Pose model...');

    const createPose = () =>
      new Pose({
      locateFile: (file) => {
        // MediaPipe requests model files using an internal path, e.g.
        // `third_party/mediapipe/modules/pose_landmark/pose_landmark_full.tflite`.
        // We bundle `.tflite` assets under `client/public/` so they are served
        // from the same origin (no CDN dependency for the model binary).
        if (file.endsWith('.tflite')) {
          const base = file.split('/').pop();
          if (file.includes('third_party/mediapipe/modules/pose_landmark/')) {
            return `/${file}`;
          }
          // Some runtimes request only the basename (e.g. `pose_landmark_full.tflite`)
          return `/third_party/mediapipe/modules/pose_landmark/${base}`;
        }

        // Other MediaPipe assets (wasm/graphs) can still be loaded from CDN.
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/${file}`;
      },
    });
    const applyPoseOptions = (poseInstance, modelComplexity) => {
      // IMPORTANT: modelComplexity must be set via setOptions().
      // Constructor options are ignored by @mediapipe/pose for these fields.
      poseInstance.setOptions({
        modelComplexity,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
    };

    let pose = createPose();
    const onResults = (results) => {
      if (!runningRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const video = videoRef.current;
      if (!ctx || !canvas || !video) return;

      try {
        // Ensure canvas matches video resolution.
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
          landmarkSeenRef.current = true;
          setLandmarkFrames((n) => n + 1);
          setStatus('Pose detected');

          // Draw skeleton.
          drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#22c55e',
            lineWidth: 3
          });
          drawLandmarks(ctx, results.poseLandmarks, {
            color: '#f59e0b',
            lineWidth: 1
          });

          updateFromLandmarks(results.poseLandmarks);
        } else {
          setStatus('No person detected yet');
        }
      } catch {
        // Avoid crashing on occasional landmark/render runtime issues.
      }
    };
    pose.onResults(onResults);
    applyPoseOptions(pose, 1);

    poseRef.current = pose;

    try {
      // Initialize once before the RAF loop to avoid repeated graph startup attempts.
      await pose.initialize();
    } catch (err) {
      // Automatic fallback: retry once with Lite model.
      try {
        if (errorLogCountRef.current < MAX_VERBOSE_LOGS) {
          console.warn('Pose init failed at complexity=1, retrying complexity=0', err);
          errorLogCountRef.current += 1;
        }
        await pose.close();
        pose = createPose();
        pose.onResults(onResults);
        applyPoseOptions(pose, 0);
        poseRef.current = pose;
        await pose.initialize();
        setStatus('Pose running (lite model)');
      } catch (errLite) {
        if (errorLogCountRef.current < MAX_VERBOSE_LOGS) {
          console.error('Pose initialization failed', errLite);
          errorLogCountRef.current += 1;
        }
        runningRef.current = false;
        poseFailedRef.current = true;
        setRunning(false);
        setStatus('Pose initialization failed (check console)');
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
        }
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }
    }

    // If the model initializes but no person is detected, stop to avoid
    // hammering pose.send() and spamming the console.
    if (noLandmarkTimeoutRef.current) clearTimeout(noLandmarkTimeoutRef.current);
    noLandmarkTimeoutRef.current = setTimeout(() => {
      if (!runningRef.current) return;
      if (!landmarkSeenRef.current) {
        runningRef.current = false;
        setRunning(false);
        setStatus('No pose landmarks detected (check console)');
      }
    }, 8000);

    const loop = async () => {
      if (!runningRef.current) return;

      rafRef.current = requestAnimationFrame(loop);

      if (!poseRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;

      if (processingRef.current) return;
      if (poseFailedRef.current) return;

      processingRef.current = true;
      try {
        // IMPORTANT: do not overlap send() calls.
        await poseRef.current.send({ image: v });
      } catch (err) {
        // Ignore occasional MediaPipe runtime errors (e.g. during camera init).
        failuresRef.current += 1;
        sendErrorCountRef.current += 1;
        if (
          errorLogCountRef.current < MAX_VERBOSE_LOGS ||
          sendErrorCountRef.current % 50 === 0
        ) {
          console.warn('Pose send() failed', err);
          errorLogCountRef.current += 1;
        }
        if (failuresRef.current >= 3) {
          poseFailedRef.current = true;
          runningRef.current = false;
          setRunning(false);
          setStatus('Pose failed to start (check console)');
        }
      } finally {
        processingRef.current = false;
      }
    };

    loop();
  };

  const stop = () => {
    runningRef.current = false;
    poseFailedRef.current = false;
    if (poseRef.current?.close) {
      // Best-effort cleanup of mediapipe resources.
      Promise.resolve(poseRef.current.close()).catch(() => {});
    }
    poseRef.current = null;
    setRunning(false);
    setStatus('Stopped');
    if (noLandmarkTimeoutRef.current) {
      clearTimeout(noLandmarkTimeoutRef.current);
      noLandmarkTimeoutRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    processingRef.current = false;
  };

  return (
    <div className="pt-page">
      <div className="pt-container max-w-5xl">
        <div className="pt-label">AI Trainer</div>
        <h1 className="mt-1 pt-title">Live rep counting</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="pt-card p-3 lg:col-span-2">
            <div className="relative">
              <video ref={videoRef} className="w-full rounded-2xl bg-black" playsInline />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full rounded-2xl"
              />
              <div className="absolute left-3 top-3 rounded-xl border border-white/10 bg-black/75 px-3 py-1.5 text-xs text-fit-muted backdrop-blur-md">
                {status} {landmarkFrames ? `• landmarks: ${landmarkFrames}` : ''}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-fit-muted">Tip: stand in frame and keep good lighting.</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={start}
                  disabled={running}
                  className="pt-btn-primary w-auto px-5 py-2 text-sm"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={!running}
                  className="pt-btn-danger px-4 py-2 text-sm"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div className="pt-card p-5">
            <div className="text-sm font-semibold text-white">Exercises</div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-colors ${
                  mode === 'all'
                    ? 'border-fit-lime bg-fit-lime text-white'
                    : 'border-white/10 bg-black/30 text-fit-muted hover:border-white/15 hover:bg-white/5'
                }`}
              >
                All
              </button>
              {EXERCISES.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => setMode(e.key)}
                  className={`rounded-2xl border px-3 py-2 text-xs font-medium transition-colors ${
                    mode === e.key
                      ? 'border-fit-lime bg-fit-lime text-white'
                      : 'border-white/10 bg-black/30 text-fit-muted hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              {EXERCISES.map((e) => {
                const isFlash = flashKey === e.key;
                const hidden = mode !== 'all' && mode !== e.key;
                if (hidden) return null;
                return (
                  <div
                    key={e.key}
                    className={`rounded-2xl border border-white/5 bg-black/35 p-3 ${
                      isFlash ? 'ring-2 ring-fit-lime/40' : ''
                    }`}
                  >
                    <div className="text-xs font-medium text-fit-muted">{e.label}</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-fit-lime">
                      {counts[e.key]}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-5 text-xs leading-relaxed text-fit-muted">
              Rep counting is heuristic-based. Adjust movement for stable landmark detection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

