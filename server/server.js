import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';

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

function extractJson(text) {
  const s = text || '';
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Failed to extract JSON from model output');
  }
  return JSON.parse(s.slice(start, end + 1));
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

async function generateGroceryListFromGaps({ bodyTwin }) {
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

  return { items, totalCost };
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

      // 2) Mood/recovery extraction
      const analysisPrompt = [
        'You are an empathetic fitness coach.',
        'Given a user voice transcript, estimate:',
        '- moodScore: integer 1-10',
        "- energyLevel: one of ['low','medium','high']",
        '- complaints: array of short complaint phrases',
        '- recoveryScore: integer 1-10',
        'Return ONLY valid JSON with this exact schema:',
        '{',
        '  "moodScore": number,',
        '  "energyLevel": string,',
        '  "complaints": string[],',
        '  "recoveryScore": number',
        '}',
        'Transcript:',
        transcript
      ].join('\n');

      const moodResp = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: analysisPrompt }]
          }
        ],
        max_output_tokens: 250
      });

      const outputText = moodResp?.output_text || '';
      const parsed = extractJson(outputText);

      res.json({
        success: true,
        data: {
          transcript,
          moodScore: parsed.moodScore ?? null,
          energyLevel: parsed.energyLevel ?? null,
          complaints: parsed.complaints ?? [],
          recoveryScore: parsed.recoveryScore ?? null
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

    const filePath = groceryListFilePath(userId, weekId);
    const data = await readJsonFile(filePath);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message || 'Failed to load' });
  }
});

app.post('/api/grocery/generate', async (req, res) => {
  try {
    const { userId, weekId, bodyTwin, whatsappTo } = req.body || {};
    if (!userId || !weekId) {
      return res.status(400).json({ success: false, message: 'Missing userId or weekId' });
    }
    if (!bodyTwin) {
      return res.status(400).json({ success: false, message: 'Missing bodyTwin' });
    }

    // Step 1: Generate the grocery list with GPT-4o.
    const { items, totalCost } = await generateGroceryListFromGaps({ bodyTwin });

    // Step 2: Save the generated list.
    const doc = {
      items,
      totalCost,
      generatedAt: new Date().toISOString(),
      approved: false,
      orderedVia: null
    };

    await writeJsonFile(groceryListFilePath(userId, weekId), doc);

    // Step 3: Send WhatsApp message via Twilio (if configured + whatsappTo provided).
    let whatsapp = null;
    if (whatsappTo) {
      const msg = formatGroceryWhatsAppMessage({ items, totalCost });
      whatsapp = await sendWhatsApp({ to: whatsappTo, body: msg });

      // Track pending reply context so the webhook can update the correct doc.
      const pendingFrom = normalizeWhatsAppAddress(whatsappTo);
      if (whatsapp?.ok && pendingFrom) {
        await writeJsonFile(pendingReplyFilePath(pendingFrom), { userId, weekId });
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

    const filePath = groceryListFilePath(userId, weekId);
    const doc = await readJsonFile(filePath);
    if (!doc) return res.status(404).json({ success: false, message: 'Grocery list not found' });

    // Step 3: Resend the same WhatsApp list message.
    const msg = formatGroceryWhatsAppMessage({ items: doc.items, totalCost: doc.totalCost });
    const whatsapp = await sendWhatsApp({ to: whatsappTo, body: msg });

    // Refresh pending mapping for the webhook.
    const pendingFrom = normalizeWhatsAppAddress(whatsappTo);
    if (whatsapp?.ok && pendingFrom) {
      await writeJsonFile(pendingReplyFilePath(pendingFrom), { userId, weekId });
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

    const pending = await readJsonFile(pendingReplyFilePath(from));
    if (!pending?.userId || !pending?.weekId) {
      return res.status(404).send('<Response></Response>');
    }

    const { userId, weekId } = pending;
    const filePath = groceryListFilePath(userId, weekId);
    const doc = await readJsonFile(filePath);
    if (!doc) {
      return res.status(404).send('<Response></Response>');
    }

    if (isYes) {
      // Update Firestore/locally: approved = true
      doc.approved = true;
      await writeJsonFile(filePath, doc);

      // Then send deep links message.
      const deepLinksMsg = formatDeepLinksWhatsAppMessage(doc.items);
      await sendWhatsApp({ to: from, body: deepLinksMsg });
    } else if (isNo) {
      doc.approved = false;
      await writeJsonFile(filePath, doc);
    }

    // Clear pending mapping after handling a YES/NO.
    if (isYes || isNo) {
      await fs.unlink(pendingReplyFilePath(from)).catch(() => null);
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

