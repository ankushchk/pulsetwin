import { useEffect, useMemo, useState } from 'react';

export default function ToastNotification() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const { type, message } = e?.detail || {};
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, type: type || 'error', message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    };

    window.addEventListener('pulse-toast', handler);
    return () => window.removeEventListener('pulse-toast', handler);
  }, []);

  const toastStyles = useMemo(
    () => ({
      error: 'border-l-fit-rose bg-fit-surface text-white ring-1 ring-white/5',
      success: 'border-l-fit-lime bg-fit-surface text-white ring-1 ring-white/5',
      info: 'border-l-fit-cyan bg-fit-surface text-white ring-1 ring-white/5'
    }),
    []
  );

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(100vw-2rem,24rem)]">
      <div className="flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-none rounded-2xl border border-white/5 border-l-4 px-4 py-3 shadow-lift ${toastStyles[t.type] || toastStyles.info}`}
            role="status"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-fit-muted">
              {t.type}
            </div>
            <div className="mt-1 text-sm text-white/90">{t.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
