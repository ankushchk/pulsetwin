import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import WeeklyShareCard from '../components/WeeklyShareCard.jsx';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

function triggerDownload(dataUrl) {
  const a = document.createElement('a');
  a.download = `pulse-twin-week-${new Date().toISOString().slice(0, 10)}.png`;
  a.href = dataUrl;
  a.click();
}

export default function Progress() {
  const cardRef = useRef(null);
  const { bodyTwin, nutritionLogs } = usePulseTwin();
  const [busy, setBusy] = useState(false);

  const captureCard = useCallback(async () => {
    const node = cardRef.current;
    if (!node) throw new Error('Card not ready');
    return toPng(node, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: '#000000',
      skipFonts: false
    });
  }, []);

  const downloadPng = async () => {
    setBusy(true);
    try {
      const dataUrl = await captureCard();
      triggerDownload(dataUrl);
      window.dispatchEvent(
        new CustomEvent('pulse-toast', {
          detail: { type: 'success', message: 'Saved — ready for Stories or feed.' }
        })
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('pulse-toast', {
          detail: { type: 'error', message: e?.message || 'Could not save image' }
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const shareOrDownload = async () => {
    setBusy(true);
    try {
      const dataUrl = await captureCard();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'pulse-twin-week.png', { type: 'image/png' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Pulse Twin week',
          text: 'Week in review from Pulse Twin'
        });
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: { type: 'success', message: 'Shared from your device.' }
          })
        );
      } else {
        triggerDownload(dataUrl);
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: { type: 'info', message: 'Saved PNG — use Share from your gallery on mobile.' }
          })
        );
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      try {
        const dataUrl = await captureCard();
        triggerDownload(dataUrl);
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: { type: 'info', message: 'Saved PNG instead.' }
          })
        );
      } catch {
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: { type: 'error', message: e?.message || 'Could not share' }
          })
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-page">
      <div className="pt-container-md">
        <div className="pt-label">Progress</div>
        <h1 className="mt-1 pt-title">Weekly recap</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-fit-muted">
          A 9:16 card built for Instagram Stories — streak, meals, recovery, mood, and your week
          rhythm. Save the PNG or use your phone&apos;s share sheet.
        </p>

        <div className="mt-10 flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
          <WeeklyShareCard ref={cardRef} bodyTwin={bodyTwin} nutritionLogs={nutritionLogs} />

          <div className="flex w-full max-w-sm flex-col gap-4 lg:pt-4">
            <div className="pt-card p-5">
              <div className="text-sm font-semibold text-white">Share</div>
              <p className="mt-2 text-xs leading-relaxed text-fit-muted">
                <strong className="text-white/90">Save PNG</strong> works everywhere.{' '}
                <strong className="text-white/90">Share</strong> opens the system menu on supported
                phones (Instagram, WhatsApp, etc.).
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="pt-btn-primary w-full sm:w-auto sm:flex-1"
                  disabled={busy}
                  onClick={downloadPng}
                >
                  {busy ? 'Working…' : 'Save PNG'}
                </button>
                <button
                  type="button"
                  className="pt-btn-secondary w-full sm:w-auto sm:flex-1"
                  disabled={busy}
                  onClick={shareOrDownload}
                >
                  {busy ? 'Working…' : 'Share…'}
                </button>
              </div>
            </div>
            <p className="text-center text-[11px] text-fit-muted lg:text-left">
              Tip: On desktop, drag the PNG into Instagram Creator Studio or any design tool.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
