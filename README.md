# Pulse Twin
[DEMO VIDEO](https://drive.google.com/file/d/1wf0xa2TpgHz7eyKgvkoP5L5DcorB4uUU/view)

A fitness companion web app: **Body Twin** (digital self model), **meal logging**, **voice check-ins**, **AI workout planning**, **pose-based AI trainer**, **grocery agent** with optional WhatsApp (Twilio), and **progress** views. The UI is a **React (Vite)** SPA; AI and integrations run through a small **Node (Express)** backend.

---

## Features

| Area | What it does |
|------|----------------|
| **Onboarding** | Captures goals, body stats, budget, equipment, dietary preference. |
| **Dashboard** | Today’s snapshot: macros, mood, recovery (from voice when set). |
| **Meal** | Photo → **GPT-4o** macro estimate via `/api/food/recognize`. |
| **Voice** | Short audio → **Whisper** transcript + **GPT-4o-mini** mood / energy / complaints / **recovery score**. |
| **Workout** | Rule-based plan from Body Twin + **injury tags** and recovery. |
| **AI Trainer** | Browser pose estimation (MediaPipe / TF.js) for form feedback. |
| **Body Twin** | Minimal profile + projected “future you”; optional **AI-generated avatars** via `/api/body-twin/avatar`. |
| **Grocery** | Weekly list from nutrition gaps + budget (GPT-4o) + deficiency-based meal suggestions; persisted in Firestore when server admin creds exist (falls back to local JSON); Twilio WhatsApp flow. |
| **Progress / Settings** | Progress UI and preferences tied to Body Twin state. |

**Body Twin state** defaults live in `shared/bodyTwinDefaults.js` and are held in React context (`client/src/state/PulseTwinProvider.jsx`) unless you add persistence.

---

## Project layout

```
pulseaitwin/
├── client/          # React + Vite + Tailwind
├── server/          # Express API (OpenAI, Twilio, grocery persistence)
├── shared/          # Shared JS (Body Twin defaults, constants)
└── README.md
```

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- **OpenAI API key** (required for food, voice analysis, grocery, avatars)
- **Twilio** (optional; only for grocery WhatsApp)

---

## Quick start

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Default port is **`5006`** unless you set `PORT` (e.g. `5008` to match the client).

Health check: `GET http://localhost:<PORT>/api/health`

### 2. Frontend

```bash
cd client
npm install
cp .env.example .env   # or create .env with VITE_API_BASE_URL
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

---

## Environment variables

### `server/.env` (do not commit real secrets)

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | Food, voice, grocery, body-twin avatars |
| `PORT` | No | Server port (default `5006`) |
| `TWILIO_ACCOUNT_SID` | For WhatsApp | Twilio account |
| `TWILIO_AUTH_TOKEN` | For WhatsApp | Twilio auth (or legacy `TWILLIO_API_KEY` as token fallback in code) |
| `TWILIO_FROM_WHATSAPP` | For WhatsApp | e.g. `whatsapp:+14155238886` (sandbox) |
| `FIREBASE_PROJECT_ID` | Optional | Enables Firestore persistence on server |
| `FIREBASE_CLIENT_EMAIL` | Optional | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | Optional | Firebase Admin private key (`\\n` escaped in env) |

### `client/.env`

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Base URL of the Express server (no trailing slash), e.g. `http://localhost:5008` |

Templates: `server/.env.example`, `client/.env.example`.

Optional: Firebase-style `VITE_FIREBASE_*` vars if you wire Firebase later; the current prototype runs without them.

---

## API overview (server)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness |
| POST | `/api/food/recognize` | JSON body: `{ image, mimeType }` (data URL or base64) |
| POST | `/api/voice/transcribe` | `multipart/form-data` field `audio` |
| POST | `/api/body-twin/avatar` | JSON: avatar prompt params → image `data:image/png;base64,...` |
| GET | `/api/grocery/list` | Query: `userId`, `weekId` |
| POST | `/api/grocery/generate` | JSON: `userId`, `weekId`, `bodyTwin`, optional `nutritionLogs`, optional `whatsappTo` |
| POST | `/api/grocery/resend` | Resend list message |
| POST | `/api/grocery/whatsapp-reply` | Twilio webhook (form body): YES/NO handling |

Grocery lists are stored in **Firestore** when Firebase Admin env vars are set; otherwise they are stored under **`server/data/grocery_lists/`** (gitignored).

---

## Grocery + WhatsApp (optional)

1. Configure Twilio **WhatsApp** (sandbox or approved sender).
2. Set `TWILIO_*` env vars and restart the server.
3. In the Grocery page, enter WhatsApp number (country code, no `+` required in UI).
4. Point Twilio’s incoming webhook to:  
   `https://<your-host>/api/grocery/whatsapp-reply`

No Blinkit/Zepto API keys are required; product links are simple search deep links.

---

## Scripts

| Location | Command | Description |
|----------|---------|-------------|
| `client/` | `npm run dev` | Vite dev server |
| `client/` | `npm run build` | Production build → `client/dist` |
| `client/` | `npm run preview` | Preview production build |
| `server/` | `npm run dev` | Run `node server.js` |

---

## Shared code

- `shared/bodyTwinDefaults.js` — default **Body Twin** object shape  
- `shared/constants.js` — onboarding enums (goals, body types, equipment)

Import from client as `../../../shared/...` (paths vary by file).

---

## Tech stack

- **Client:** React 18, React Router 7, Vite 5, Tailwind CSS  
- **Server:** Express, OpenAI SDK (Responses + Chat Completions + Whisper + Images), Twilio, Multer  
- **Trainer:** MediaPipe Pose + TensorFlow.js (see `client` dependencies)

---

## Security & privacy

- Never commit `.env` files or API keys.
- This app is a **prototype**; treat AI outputs as **informational**, not medical advice.
- Voice and images are sent to your configured **OpenAI** endpoints when those features are used.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `ERR_CONNECTION_REFUSED` from client | Server running? `VITE_API_BASE_URL` matches `PORT`? |
| Grocery / API 404 | Restart server after pulling new routes. |
| Twilio errors | `TWILIO_ACCOUNT_SID`, token, `TWILIO_FROM_WHATSAPP`, sandbox join. |
| Recovery score empty | Server uses Chat Completions JSON for mood payload; restart server after updates. |

---

## License

Private / unlicensed unless you add a `LICENSE` file.
