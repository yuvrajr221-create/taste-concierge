# Taste Concierge (Qloo Agentic Hackathon)

Cross-domain taste agent: user की पसंद (फ़िल्म/गाना/जगह/ब्रांड...) → Qloo `/search` से entity IDs → `/v2/insights` से दूसरी categories में recommendations (explainability के साथ)।
Zero dependencies, सिर्फ़ Node.js.

## Termux में चलाएँ
```bash
pkg update && pkg install nodejs git -y
cd taste-agent
cp .env.example .env
nano .env          # QLOO_API_KEY डालें
node server.mjs    # फिर ब्राउज़र में http://127.0.0.1:3000
```

## API key
Hackathon key अलग से माँगनी पड़ती है (Qloo developer guide / hackathon page से request करें)।
Key सिर्फ़ `https://hackathon.api.qloo.com` पर चलती है और `X-Api-Key` header में जाती है — browser को कभी नहीं दिखती।

## Deploy (demo link के लिए)
Render / Railway / Fly पर Node app की तरह डालें, env var `QLOO_API_KEY` सेट करें, start command: `node server.mjs`.

## Files
- `server.mjs` — Qloo client, agent (`plan`), static server
- `public/index.html` — UI
