import { useEffect, useMemo, useState } from 'react';
import { usePulseTwin } from '../state/PulseTwinProvider.jsx';

function getWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.toISOString().slice(0, 10);
}

function getOrCreateUserId() {
  const key = 'pulseUserId';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `local-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, id);
  return id;
}

function deepLinksForItem(itemName) {
  const q = encodeURIComponent(itemName);
  return {
    blinkit: `https://blinkit.com/s/?q=${q}`,
    zepto: `https://www.zeptonow.com/search?query=${q}`
  };
}

function formatRs(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';
  return `Rs ${num}`;
}

export default function Grocery() {
  const { bodyTwin } = usePulseTwin();
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  const [userId] = useState(() => getOrCreateUserId());
  const [weekId] = useState(() => getWeekId());

  const [whatsappTo, setWhatsappTo] = useState(
    () => window.localStorage.getItem('pulseWhatsAppTo') || ''
  );
  useEffect(() => {
    window.localStorage.setItem('pulseWhatsAppTo', whatsappTo);
  }, [whatsappTo]);

  const [groceryList, setGroceryList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [twilioStatus, setTwilioStatus] = useState(null);
  const [error, setError] = useState(null);

  const itemsByCategory = useMemo(() => {
    const items = groceryList?.items || [];
    const grouped = {};
    for (const it of items) {
      const catRaw = it?.category || 'Other';
      const cat = String(catRaw).trim() || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(it);
    }
    return grouped;
  }, [groceryList]);

  const loadOrGenerate = async () => {
    setLoading(true);
    setError(null);
    setTwilioStatus(null);
    try {
      const listResp = await fetch(
        `${baseUrl}/api/grocery/list?userId=${encodeURIComponent(userId)}&weekId=${encodeURIComponent(weekId)}`
      );

      if (listResp.ok) {
        const json = await listResp.json();
        setGroceryList(json?.data || null);
        return;
      }

      if (listResp.status !== 404) {
        const errJson = await listResp.json().catch(() => null);
        throw new Error(errJson?.message || `Failed to load list (HTTP ${listResp.status})`);
      }

      const genResp = await fetch(`${baseUrl}/api/grocery/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          weekId,
          bodyTwin,
          whatsappTo: whatsappTo || null
        })
      });

      const genJson = await genResp.json().catch(() => null);
      if (!genResp.ok) {
        throw new Error(genJson?.message || 'Failed to generate grocery list');
      }

      setGroceryList(genJson?.data || null);
      setTwilioStatus(genJson?.whatsapp || null);
    } catch (e) {
      setError(e?.message || 'Grocery load/generate failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!baseUrl) return;
    loadOrGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, userId, weekId]);

  const onResendWhatsApp = async () => {
    setLoading(true);
    setError(null);
    setTwilioStatus(null);
    try {
      if (!whatsappTo) throw new Error('Add your WhatsApp number first.');

      const resp = await fetch(`${baseUrl}/api/grocery/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, weekId, whatsappTo })
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(json?.message || 'Failed to resend WhatsApp message');
      }

      setGroceryList(json?.data || groceryList);
      setTwilioStatus(json?.whatsapp || null);
    } catch (e) {
      setError(e?.message || 'Resend failed');
    } finally {
      setLoading(false);
    }
  };

  const totalCost = groceryList?.totalCost ?? null;
  const approved = groceryList?.approved === true;

  return (
    <div className="pt-page">
      <div className="pt-container max-w-4xl">
        <div className="pt-label">Grocery</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="pt-title">This week&apos;s list</h1>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'rounded-full border px-3 py-1 text-xs font-medium',
                approved
                  ? 'border-fit-lime/40 bg-fit-lime/10 text-fit-lime'
                  : 'border-white/10 bg-black/35 text-fit-muted'
              ].join(' ')}
            >
              {approved ? 'Approved' : 'Not approved'}
            </span>
            <span className="rounded-full border border-white/10 bg-fit-surface px-3 py-1 text-xs font-medium text-white">
              Total: {formatRs(totalCost)}
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm leading-relaxed text-zinc-400">
          Budget-capped Indian grocery list is generated from your Body Twin. Reply <b className="text-zinc-200">YES</b> on
          WhatsApp to get order links (Blinkit/Zepto).
        </div>

        <div className="mt-6 pt-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label className="text-xs font-medium text-zinc-500">WhatsApp number (with country code)</label>
              <input
                type="text"
                value={whatsappTo}
                onChange={(e) => setWhatsappTo(e.target.value)}
                placeholder="e.g. 919999999999"
                className="pt-input"
              />
            </div>
            <button
              type="button"
              onClick={onResendWhatsApp}
              disabled={loading || !groceryList}
              className="shrink-0 pt-btn-primary w-full sm:w-auto"
            >
              {loading ? 'Working...' : 'Resend WhatsApp'}
            </button>
          </div>

          {twilioStatus?.error ? (
            <div className="mt-4 text-xs text-red-400">{twilioStatus.error}</div>
          ) : null}
        </div>

        {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

        {loading && !groceryList ? <div className="mt-8 text-sm text-zinc-500">Loading...</div> : null}

        {groceryList ? (
          <div className="mt-8 space-y-6">
            {Object.keys(itemsByCategory).length ? (
              Object.entries(itemsByCategory).map(([category, items]) => (
                <div key={category} className="pt-card p-5 sm:p-6">
                  <div className="text-sm font-semibold text-zinc-100">{category}</div>
                  <div className="mt-4 space-y-3">
                    {items.map((it, idx) => {
                      const links = deepLinksForItem(it?.item || '');
                      const itemName = it?.item || 'Item';
                      const quantity = it?.quantity ? ` ${it.quantity}` : '';
                      const price = it?.estimatedPrice;

                      return (
                        <div
                          key={`${itemName}-${idx}`}
                          className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">
                                {itemName}
                                {quantity}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {formatRs(price)} • {it?.nutrientProvided || 'nutrient'}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <a
                                href={links.blinkit}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                              >
                                Open on Blinkit
                              </a>
                              <a
                                href={links.zepto}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                              >
                                Open on Zepto
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="mt-6 text-sm text-zinc-500">No items generated yet.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
