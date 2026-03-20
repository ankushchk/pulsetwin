import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import admin from 'firebase-admin';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false }));
const upload = multer({ storage: multer.memoryStorage() });

function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Missing env var: OPENAI_API_KEY');
  }
  return key;
}

const openai = new OpenAI({ apiKey: requireOpenAiKey() });

function getFirestoreAdminOrNull() {
  if (admin.apps.length) return admin.firestore();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
  return admin.firestore();
}

const firestoreDb = getFirestoreAdminOrNull();

function extractJson(text) {
  const s = stripJsonFences(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Failed to extract JSON from model output');
  }
  return JSON.parse(s.slice(start, end + 1));
}

function stripJsonFences(s) {
  const t = String(s).trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1].trim() : t;
}

function score1to10(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function normalizeMoodPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      moodScore: null,
      energyLevel: null,
      complaints: [],
      recoveryScore: null
    };
  }
  const moodScore =
    score1to10(raw.moodScore ?? raw.mood_score ?? raw.mood) ?? null;
  const recoveryScore =
    score1to10(
      raw.recoveryScore ??
        raw.recovery_score ??
        raw.recovery ??
        raw.readiness ??
        raw.readinessScore
    ) ?? null;
  let energyLevel = raw.energyLevel ?? raw.energy_level ?? raw.energy ?? null;
  if (typeof energyLevel === 'string') {
    const e = energyLevel.toLowerCase();
    if (['low', 'medium', 'high'].includes(e)) energyLevel = e;
    else energyLevel = null;
  }
  let complaints = raw.complaints ?? raw.complaint ?? [];
  if (typeof complaints === 'string') complaints = [complaints];
  if (!Array.isArray(complaints)) complaints = [];

  return {
    moodScore,
    energyLevel,
    complaints: complaints.map((x) => String(x)).filter(Boolean),
    recoveryScore
  };
}

function extractJsonArray(text) {
  const s = text || '';
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Failed to extract JSON array from model output');
  }
  return JSON.parse(s.slice(start, end + 1));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_ROOT = path.join(__dirname, 'data');

function sanitizePathSegment(seg) {
  return String(seg)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 140);
}

function groceryListFilePath(userId, weekId) {
  const u = sanitizePathSegment(userId);
  const w = sanitizePathSegment(weekId);
  return path.join(DATA_ROOT, 'grocery_lists', u, 'weeks', `${w}.json`);
}

function pendingReplyFilePath(fromWhatsapp) {
  const from = sanitizePathSegment(fromWhatsapp);
  return path.join(DATA_ROOT, 'grocery_whatsapp_pending', `${from}.json`);
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function safeDocId(v) {
  return String(v || '')
    .trim()
    .replace(/[\/\s]+/g, '_')
    .slice(0, 180);
}

async function getGroceryWeekDoc(userId, weekId) {
  if (firestoreDb) {
    const ref = firestoreDb
      .collection('grocery_lists')
      .doc(String(userId))
      .collection('weeks')
      .doc(String(weekId));
    const snap = await ref.get();
    return snap.exists ? snap.data() : null;
  }
  return readJsonFile(groceryListFilePath(userId, weekId));
}

async function setGroceryWeekDoc(userId, weekId, data) {
  if (firestoreDb) {
    const ref = firestoreDb
      .collection('grocery_lists')
      .doc(String(userId))
      .collection('weeks')
      .doc(String(weekId));
    await ref.set(
      {
        ...data,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    return;
  }
  await writeJsonFile(groceryListFilePath(userId, weekId), data);
}

async function getPendingReply(fromWhatsapp) {
  if (firestoreDb) {
    const ref = firestoreDb.collection('grocery_whatsapp_pending').doc(safeDocId(fromWhatsapp));
    const snap = await ref.get();
    return snap.exists ? snap.data() : null;
  }
  return readJsonFile(pendingReplyFilePath(fromWhatsapp));
}

async function setPendingReply(fromWhatsapp, data) {
  if (firestoreDb) {
    const ref = firestoreDb.collection('grocery_whatsapp_pending').doc(safeDocId(fromWhatsapp));
    await ref.set(
      {
        ...data,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    return;
  }
  await writeJsonFile(pendingReplyFilePath(fromWhatsapp), data);
}

async function clearPendingReply(fromWhatsapp) {
  if (firestoreDb) {
    const ref = firestoreDb.collection('grocery_whatsapp_pending').doc(safeDocId(fromWhatsapp));
    await ref.delete().catch(() => null);
    return;
  }
  await fs.unlink(pendingReplyFilePath(fromWhatsapp)).catch(() => null);
}

function normalizeWhatsAppAddress(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith('whatsapp:')) return s;
  return `whatsapp:${s}`;
}

function getWhatsAppClientOrNull() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  // Backward-compat with the repo's current env var name.
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILLIO_API_KEY;
  const from = process.env.TWILIO_FROM_WHATSAPP;

  if (!accountSid || !authToken || !from) return null;
  return {
    client: twilio(accountSid, authToken),
    from
  };
}

async function sendWhatsApp({ to, body }) {
  const normalizedTo = normalizeWhatsAppAddress(to);
  if (!normalizedTo) throw new Error('Missing WhatsApp "to" number');

  const twilioCtx = getWhatsAppClientOrNull();
  if (!twilioCtx) {
    return { ok: false, error: 'Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN/TWILLIO_API_KEY, or TWILIO_FROM_WHATSAPP)' };
  }

  await twilioCtx.client.messages.create({
    from: twilioCtx.from,
    to: normalizedTo,
    body
  });

  return { ok: true };
}

function formatGroceryWhatsAppMessage({ items, totalCost }) {
  const byCategory = {};
  const order = [];
  for (const it of items || []) {
    const catRaw = it?.category || 'Other';
    const cat = String(catRaw).trim() || 'Other';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
      order.push(cat);
    }
    byCategory[cat].push(it);
  }

  let msg = 'Your weekly grocery list is ready!\n\n';
  for (const cat of order) {
    msg += `${cat}:\n`;
    for (const it of byCategory[cat]) {
      const itemName = it?.item ? String(it.item) : 'Item';
      const qty = it?.quantity ? ` ${String(it.quantity)}` : '';
      const price = Number(it?.estimatedPrice);
      msg += `- ${itemName}${qty} — Rs ${Number.isFinite(price) ? price : 0}\n`;
    }
    msg += '\n';
  }

  msg += `Total estimated cost: Rs ${totalCost}\n\n`;
  msg += 'Reply YES to get order links\n';
  msg += 'Reply NO to skip this week';
  return msg;
}

function formatDeepLinksWhatsAppMessage(items) {
  let msg = 'Here are your order links:\n\n';
  for (const it of items || []) {
    const itemName = it?.item ? String(it.item) : 'Item';
    const q = encodeURIComponent(itemName);
    const blinkit = `https://blinkit.com/s/?q=${q}`;
    const zepto = `https://www.zeptonow.com/search?query=${q}`;
    msg += `${itemName}:\n`;
    msg += `Blinkit: ${blinkit}\n`;
    msg += `Zepto: ${zepto}\n\n`;
  }
  return msg.trimEnd();
}

function normalizeGroceryInputsFromBodyTwin(bodyTwin) {
  const weeklyNutritionGaps =
    bodyTwin?.weeklyNutritionGaps ||
    bodyTwin?.nutritionGaps ||
    ['protein', 'iron', 'calcium'];

  const budgetDailyFoodBudget =
    Number(bodyTwin?.budget?.dailyFoodBudget ?? bodyTwin?.budget?.dailyFoodBudgetRupees);

  const budget = Number.isFinite(budgetDailyFoodBudget) && budgetDailyFoodBudget > 0 ? budgetDailyFoodBudget : 150;
  const affordableModeOn = Boolean(bodyTwin?.budget?.affordableModeOn ?? bodyTwin?.affordableMode);
  const dietaryPreference = bodyTwin?.dietaryPreference || 'non-veg';

  return {
    weeklyNutritionGaps,
    budget,
    affordableModeOn,
    dietaryPreference
  };
}

function computeDeficiencySignals({ bodyTwin, nutritionLogs }) {
  const weeklyNutritionGaps = bodyTwin?.weeklyNutritionGaps || bodyTwin?.nutritionGaps || [];

  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysEntries = Array.isArray(nutritionLogs?.[todayKey]) ? nutritionLogs[todayKey] : [];
  const totals = todaysEntries.reduce(
    (acc, e) => {
      acc.calories += Number(e?.calories || 0);
      acc.protein += Number(e?.protein || 0);
      acc.carbs += Number(e?.carbs || 0);
      acc.fat += Number(e?.fat || 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const targets = { protein: 70, carbs: 220, fat: 60, calories: 2000 };
  const macroDeficiencies = Object.keys(targets)
    .map((k) => ({ key: k, missing: Math.max(0, targets[k] - Number(totals[k] || 0)) }))
    .filter((x) => x.missing > 0);

  return {
    weeklyNutritionGaps,
    todayMacroTotals: totals,
    macroDeficiencies
  };
}

async function generateMealSuggestionsFromDeficiency({
  bodyTwin,
  nutritionLogs,
  budget,
  dietaryPreference
}) {
  const deficiency = computeDeficiencySignals({ bodyTwin, nutritionLogs });
  const prompt = [
    'You are a practical Indian nutrition coach.',
    `Dietary preference: ${dietaryPreference}.`,
    `Daily food budget: Rs ${budget}.`,
    `Weekly nutrition gaps: ${JSON.stringify(deficiency.weeklyNutritionGaps)}.`,
    `Today macro totals: ${JSON.stringify(deficiency.todayMacroTotals)}.`,
    `Detected macro deficiencies: ${JSON.stringify(deficiency.macroDeficiencies)}.`,
    'Suggest 5 simple Indian meals/snacks for tomorrow to cover these deficiencies.',
    'Return ONLY JSON array with schema:',
    '[',
    '  {',
    '    "meal": string,',
    '    "why": string,',
    '    "keyNutrients": string[],',
    '    "estimatedCost": number',
    '  }',
    ']'
  ].join('\n');

  const response = await openai.responses.create({
    model: 'gpt-4o',
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    max_output_tokens: 700
  });

  const outputText = response?.output_text || '';
  const parsed = extractJsonArray(outputText);
  return (Array.isArray(parsed) ? parsed : []).map((m) => ({
    meal: String(m?.meal || ''),
    why: String(m?.why || ''),
    keyNutrients: Array.isArray(m?.keyNutrients) ? m.keyNutrients.map((x) => String(x)) : [],
    estimatedCost: Number(m?.estimatedCost || 0)
  }));
}

async function generateGroceryListFromGaps({ bodyTwin, nutritionLogs }) {
  const { weeklyNutritionGaps, budget, affordableModeOn, dietaryPreference } =
    normalizeGroceryInputsFromBodyTwin(bodyTwin);

  // Step 1 prompt structure must follow the provided template.
  const prompt = `Based on these nutrition gaps: ${JSON.stringify(
    { weeklyNutritionGaps, affordableModeOn, dietaryPreference },
    null,
    0
  )}
and a daily budget of Rs ${budget},
generate a weekly Indian grocery list.
Return JSON array with this structure:
[
  {
    item: string,
    quantity: string,
    estimatedPrice: number,
    nutrientProvided: string,
    category: string
  }
]
Keep total cost under Rs ${budget * 7}.
Prioritize locally available Indian items.`;

  const response = await openai.responses.create({
    model: 'gpt-4o',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ],
    max_output_tokens: 900
  });

  const outputText = response?.output_text || '';
  const parsed = extractJsonArray(outputText);

  const items = (Array.isArray(parsed) ? parsed : [])
    .map((x) => ({
      item: x?.item ? String(x.item) : '',
      quantity: x?.quantity ? String(x.quantity) : '',
      estimatedPrice: Number(x?.estimatedPrice),
      nutrientProvided: x?.nutrientProvided ? String(x.nutrientProvided) : '',
      category: x?.category ? String(x.category) : 'Other'
    }))
    .filter((it) => it.item && it.estimatedPrice && Number.isFinite(it.estimatedPrice));

  const totalLimit = budget * 7;
  const computedTotal = items.reduce((acc, it) => acc + (Number(it.estimatedPrice) || 0), 0);
  let totalCost = Math.round(computedTotal);

  // Enforce the budget cap by scaling prices if needed.
  if (totalCost > totalLimit && computedTotal > 0) {
    const ratio = totalLimit / computedTotal;
    for (const it of items) {
      it.estimatedPrice = Math.max(1, Math.round(Number(it.estimatedPrice) * ratio));
    }
    totalCost = items.reduce((acc, it) => acc + (Number(it.estimatedPrice) || 0), 0);
  }

  const mealSuggestions = await generateMealSuggestionsFromDeficiency({
    bodyTwin,
    nutritionLogs,
    budget,
    dietaryPreference
  });

  return { items, totalCost, mealSuggestions };
}

function getWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.toISOString().slice(0, 10);
}

function detectVoiceIntentByRules(transcript) {
  const t = String(transcript || '').toLowerCase();
  const hasGrocery =
    /\bgrocery\b|\bshopping\b|\bbuy food\b|\bbuy groceries\b|\bfood list\b|\bcreate list\b|\bweekly list\b|\bkitchen\b/.test(
      t
    );
  const hasWorkout =
    /\bworkout\b|\bexercise\b|\btraining\b|\bgym\b|\bplan my workout\b|\bopen workout\b|\bregenerate workout\b|\btoday'?s workout\b/.test(
      t
    );
  const hasSummary =
    /\brecovery\b|\bsummary\b|\bhow am i\b|\bstatus\b|\bmood\b|\bhealth summary\b/.test(t);

  if (hasGrocery) return 'generate_grocery';
  if (hasWorkout) return 'generate_workout';
  if (hasSummary) return 'recovery_summary';
  return 'unknown';
}

async function detectVoiceIntent(transcript) {
  const byRules = detectVoiceIntentByRules(transcript);
  if (byRules !== 'unknown') return byRules;

  // Fallback: classify ambiguous commands with a lightweight model.
  const prompt = [
    'Classify this fitness app command into one intent.',
    'Valid intents:',
    '- generate_workout',
    '- generate_grocery',
    '- recovery_summary',
    'Return ONLY JSON like {"intent":"generate_workout"}.',
    `Command: ${String(transcript || '')}`
  ].join('\n');

  try {
    const cls = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a strict intent classifier. Output JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 80
    });
    const raw = cls?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(stripJsonFences(raw));
    const intent = String(parsed?.intent || '').trim();
    if (intent === 'generate_workout' || intent === 'generate_grocery' || intent === 'recovery_summary') {
      return intent;
    }
  } catch {
    // ignore and use default fallback
  }

  return 'recovery_summary';
}

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok' });
});

app.post('/api/food/recognize', async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    if (!image) {
      return res.status(400).json({ success: false, message: 'Missing image data URL' });
    }

    // If client sends just a base64 string, try to wrap it.
    const imageDataUrl = image.includes('data:')
      ? image
      : `data:${mimeType || 'image/jpeg'};base64,${image}`;

    const prompt = [
      'You are a nutrition expert.',
      'Analyze the meal in the provided image and estimate macros.',
      'Return ONLY valid JSON (no markdown) with this exact schema:',
      '{',
      '  "meal": string,',
      '  "items": [{ "name": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }],',
      '  "totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }',
      '}',
      'Rules:',
      '- Use grams for macros.',
      '- Use plausible portion sizes.',
      '- If unsure, provide the best estimate.'
    ].join('\n');

    const response = await openai.responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageDataUrl }
          ]
        }
      ],
      max_output_tokens: 400
    });

    const outputText = response?.output_text || '';
    const parsed = extractJson(outputText);

    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to recognize food'
    });
  }
});

app.post(
  '/api/voice/transcribe',
  upload.single('audio'),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: 'Missing audio file' });
      }

      const { default: undici } = await import('undici');
      const { File } = undici;

      const audioFile = new File([file.buffer], file.originalname, {
        type: file.mimetype || 'audio/webm'
      });

      // 1) Whisper transcription
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1'
      });

      const transcript = transcription?.text || '';
      if (!transcript) {
        return res
          .status(422)
          .json({ success: false, message: 'Empty transcript' });
      }

      // 2) Mood/recovery extraction (Chat Completions + JSON is more reliable than Responses output_text)
      const analysisUserPrompt = [
        'You are an empathetic fitness coach.',
        'Given the user voice transcript below, estimate:',
        '- moodScore: integer 1-10',
        "- energyLevel: exactly one of: low, medium, high",
        '- complaints: array of short complaint phrases (empty array if none)',
        '- recoveryScore: integer 1-10 (how rested/recovered they seem)',
        'Return a single JSON object with keys: moodScore, energyLevel, complaints, recoveryScore.',
        'Transcript:',
        transcript
      ].join('\n');

      const moodCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You output only valid JSON objects. No markdown, no explanation.'
          },
          { role: 'user', content: analysisUserPrompt }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 250
      });

      const outputText = moodCompletion?.choices?.[0]?.message?.content || '';
      let parsed;
      try {
        parsed = JSON.parse(stripJsonFences(outputText));
      } catch {
        parsed = extractJson(outputText);
      }
      const mood = normalizeMoodPayload(parsed);

      res.json({
        success: true,
        data: {
          transcript,
          moodScore: mood.moodScore,
          energyLevel: mood.energyLevel,
          complaints: mood.complaints,
          recoveryScore: mood.recoveryScore
        }
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to transcribe voice'
      });
    }
  }
);

app.post('/api/agent/voice-command', async (req, res) => {
  try {
    const { transcript, userId, weekId, bodyTwin, nutritionLogs, whatsappTo } = req.body || {};
    if (!transcript) {
      return res.status(400).json({ success: false, message: 'Missing transcript' });
    }

    const intent = await detectVoiceIntent(transcript);

    if (intent === 'generate_grocery') {
      if (!userId || !bodyTwin) {
        return res
          .status(400)
          .json({ success: false, message: 'Missing userId/bodyTwin for grocery action' });
      }

      const resolvedWeekId = weekId || getWeekId();
      const { items, totalCost, mealSuggestions } = await generateGroceryListFromGaps({
        bodyTwin,
        nutritionLogs
      });

      const docData = {
        items,
        mealSuggestions,
        totalCost,
        generatedAt: new Date().toISOString(),
        approved: false,
        orderedVia: null
      };
      await setGroceryWeekDoc(userId, resolvedWeekId, docData);

      let whatsapp = null;
      if (whatsappTo) {
        const msg = formatGroceryWhatsAppMessage({ items, totalCost });
        whatsapp = await sendWhatsApp({ to: whatsappTo, body: msg });
        const pendingFrom = normalizeWhatsAppAddress(whatsappTo);
        if (whatsapp?.ok && pendingFrom) {
          await setPendingReply(pendingFrom, { userId, weekId: resolvedWeekId });
        }
      }

      return res.json({
        success: true,
        data: {
          intent,
          transcript,
          message: `Generated weekly grocery list with ${items.length} items under Rs ${totalCost}.`,
          navigateTo: '/grocery',
          grocery: { ...docData, weekId: resolvedWeekId },
          whatsapp
        }
      });
    }

    if (intent === 'generate_workout') {
      const recoveryScore = Number(bodyTwin?.recoveryScore ?? 5);
      const level = recoveryScore <= 3 ? 'Low' : recoveryScore >= 7 ? 'High' : 'Medium';
      return res.json({
        success: true,
        data: {
          intent,
          transcript,
          message: `Workout regenerated from latest voice check-in. Recovery ${recoveryScore}/10 -> ${level} intensity session.`,
          navigateTo: '/workout'
        }
      });
    }

    const moodScore = bodyTwin?.mood?.moodScore ?? null;
    const recoveryScore = bodyTwin?.recoveryScore ?? null;
    const complaints = Array.isArray(bodyTwin?.mood?.physicalComplaints)
      ? bodyTwin.mood.physicalComplaints
      : [];

    return res.json({
      success: true,
      data: {
        intent: 'recovery_summary',
        transcript,
        message: `Recovery ${recoveryScore ?? '-'}/10, mood ${moodScore ?? '-'}/10${
          complaints.length ? `, complaints: ${complaints.join(', ')}` : ''
        }.`,
        navigateTo: null
      }
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: err?.message || 'Voice command failed' });
  }
});

app.post('/api/body-twin/avatar', async (req, res) => {
  try {
    const {
      label = 'current',
      style = 'friendly 3d fitness app avatar',
      genderStyle = 'neutral',
      bodyShape = 'average',
      fitnessLevel = 5,
      vibe = 'confident, healthy'
    } = req.body || {};

    const prompt = [
      'Create a single full-body digital avatar for a fitness app.',
      `Render style: ${style}.`,
      `Gender presentation: ${genderStyle}.`,
      `Body shape: ${bodyShape}.`,
      `Fitness level (1-10): ${fitnessLevel}.`,
      `Mood/vibe: ${vibe}.`,
      `Use clean studio background, centered composition, soft cinematic lighting.`,
      `No text, no watermark, no logos.`,
      `This is the "${label}" avatar card.`
    ].join(' ');

    const imageResp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024'
    });

    const b64 = imageResp?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ success: false, message: 'Avatar image generation failed' });
    }

    return res.json({
      success: true,
      data: {
        imageDataUrl: `data:image/png;base64,${b64}`
      }
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to generate avatar' });
  }
});

app.get('/api/grocery/list', async (req, res) => {
  try {
    const { userId, weekId } = req.query || {};
    if (!userId || !weekId) {
      return res.status(400).json({ success: false, message: 'Missing userId or weekId' });
    }

    const data = await getGroceryWeekDoc(userId, weekId);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message || 'Failed to load' });
  }
});

app.post('/api/grocery/generate', async (req, res) => {
  try {
    const { userId, weekId, bodyTwin, nutritionLogs, whatsappTo } = req.body || {};
    if (!userId || !weekId) {
      return res.status(400).json({ success: false, message: 'Missing userId or weekId' });
    }
    if (!bodyTwin) {
      return res.status(400).json({ success: false, message: 'Missing bodyTwin' });
    }

    // Step 1: Generate the grocery list with GPT-4o.
    const { items, totalCost, mealSuggestions } = await generateGroceryListFromGaps({
      bodyTwin,
      nutritionLogs
    });

    // Step 2: Save the generated list.
    const doc = {
      items,
      mealSuggestions,
      totalCost,
      generatedAt: new Date().toISOString(),
      approved: false,
      orderedVia: null
    };

    await setGroceryWeekDoc(userId, weekId, doc);

    // Step 3: Send WhatsApp message via Twilio (if configured + whatsappTo provided).
    let whatsapp = null;
    if (whatsappTo) {
      const msg = formatGroceryWhatsAppMessage({ items, totalCost });
      whatsapp = await sendWhatsApp({ to: whatsappTo, body: msg });

      // Track pending reply context so the webhook can update the correct doc.
      const pendingFrom = normalizeWhatsAppAddress(whatsappTo);
      if (whatsapp?.ok && pendingFrom) {
        await setPendingReply(pendingFrom, { userId, weekId });
      }
    } else {
      whatsapp = { ok: false, error: 'whatsappTo missing; generated list saved locally but WhatsApp not sent' };
    }

    return res.json({ success: true, data: doc, whatsapp });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to generate grocery list' });
  }
});

app.post('/api/grocery/resend', async (req, res) => {
  try {
    const { userId, weekId, whatsappTo } = req.body || {};
    if (!userId || !weekId || !whatsappTo) {
      return res.status(400).json({ success: false, message: 'Missing userId, weekId, or whatsappTo' });
    }

    const doc = await getGroceryWeekDoc(userId, weekId);
    if (!doc) return res.status(404).json({ success: false, message: 'Grocery list not found' });

    // Step 3: Resend the same WhatsApp list message.
    const msg = formatGroceryWhatsAppMessage({ items: doc.items, totalCost: doc.totalCost });
    const whatsapp = await sendWhatsApp({ to: whatsappTo, body: msg });

    // Refresh pending mapping for the webhook.
    const pendingFrom = normalizeWhatsAppAddress(whatsappTo);
    if (whatsapp?.ok && pendingFrom) {
      await setPendingReply(pendingFrom, { userId, weekId });
    }

    return res.json({ success: true, data: doc, whatsapp });
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message || 'Failed to resend' });
  }
});

// Step 5: Twilio webhook for reply (YES => approved, NO => not approved).
app.post('/api/grocery/whatsapp-reply', async (req, res) => {
  try {
    const bodyText = String(req.body?.Body ?? req.body?.body ?? '').trim();
    const decision = bodyText.toUpperCase();
    const isYes = decision.includes('YES');
    const isNo = decision.includes('NO');

    const fromRaw = req.body?.From ?? req.body?.from;
    const from = normalizeWhatsAppAddress(fromRaw);

    if (!from) {
      return res.status(400).send('<Response></Response>');
    }

    const pending = await getPendingReply(from);
    if (!pending?.userId || !pending?.weekId) {
      return res.status(404).send('<Response></Response>');
    }

    const { userId, weekId } = pending;
    const doc = await getGroceryWeekDoc(userId, weekId);
    if (!doc) {
      return res.status(404).send('<Response></Response>');
    }

    if (isYes) {
      // Update Firestore/locally: approved = true
      doc.approved = true;
      await setGroceryWeekDoc(userId, weekId, doc);

      // Then send deep links message.
      const deepLinksMsg = formatDeepLinksWhatsAppMessage(doc.items);
      await sendWhatsApp({ to: from, body: deepLinksMsg });
    } else if (isNo) {
      doc.approved = false;
      await setGroceryWeekDoc(userId, weekId, doc);
    }

    // Clear pending mapping after handling a YES/NO.
    if (isYes || isNo) {
      await clearPendingReply(from);
    }

    // Twilio expects a quick response.
    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    res.type('text/xml').send('<Response></Response>');
  }
});

const port = process.env.PORT || 5006;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Pulse Twin server listening on port ${port}`);
});

