# Submission draft — Taste Concierge

## 1. Problem
People describe taste in one domain ("I love Interstellar") but want suggestions in others (music, places, books). Generic LLM answers hallucinate or repeat popular items. We need evidence-backed cross-domain taste matching.

## 2. Qloo usage and why it fits
- `GET /search` resolves a user-typed favorite to a Qloo entity; the user picks the exact match (disambiguation is a real decision, not automatic).
- `GET /v2/insights` with all chosen entities as `signal.interests.entities`, once per target domain (movies, music, places, brands, books, ...), with explainability requested.
- Without Qloo the app returns nothing: there is no fallback list and no LLM-invented recommendation. All names, scores and tags shown come from Qloo.

## 3. Redacted example
(Fill in after first live run: seeds -> chosen entity IDs -> top 3 results per domain with affinity and tags. Remove the key and any personal data.)

## 4. Demo
(Screenshots or short screen recording of: search -> pick entity -> select domains -> results.)

## 5. Setup from a clean environment
```
git clone <repo>
cd taste-agent
cp .env.example .env     # put your own hackathon key
node server.mjs          # Node >= 20, no npm install needed
```
Open http://127.0.0.1:3000. Key stays server-side; browser never sees it.

## 6. Known limitations
- Affinity describes what groups of similar favorites tend to like; it is not a prediction or probability for one person and not a causal claim.
- Results depend on the entity the user picks; ambiguous names can change the outcome.
- Max 10 seeds and 5 domains per request; 5-minute in-memory cache; no accounts, no stored user data.

## Responsible data handling
No names, emails, device IDs or location sent to Qloo, only public cultural entities. No key in the browser, repo or logs.
