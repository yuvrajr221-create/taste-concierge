// Taste Concierge — zero-dependency Node server (works in Termux).
// All Qloo calls happen here; the API key never reaches the browser.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// --- tiny .env loader ---
if (existsSync(join(__dirname, '.env'))) {
  for (const line of readFileSync(join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const QLOO_KEY = process.env.QLOO_API_KEY || '';
const QLOO_BASE = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

// Entity types Qloo supports -> label shown in UI
const TYPES = {
  'urn:entity:movie': 'Movies',
  'urn:entity:artist': 'Music',
  'urn:entity:place': 'Places & Food',
  'urn:entity:brand': 'Brands',
  'urn:entity:book': 'Books',
  'urn:entity:tv_show': 'TV Shows',
  'urn:entity:destination': 'Travel',
  'urn:entity:podcast': 'Podcasts',
  'urn:entity:videogame': 'Games',
};

const cache = new Map();
async function qloo(path, params) {
  if (!QLOO_KEY) throw Object.assign(new Error('QLOO_API_KEY set nahi hai (.env dekhein)'), { status: 503 });
  const url = new URL(path, QLOO_BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const ck = url.toString();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < 5 * 60_000) return hit.d;
  const res = await fetch(url, { headers: { 'X-Api-Key': QLOO_KEY }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const e = new Error(`Qloo error ${res.status}`);
    e.status = res.status === 404 ? 404 : 502;
    throw e;
  }
  const d = await res.json();
  cache.set(ck, { t: Date.now(), d });
  if (process.env.DEBUG_RAW) {
    // Saves the latest raw response per endpoint (no key inside) so field names can be verified quickly.
    const name = path.replace(/\W+/g, '_');
    writeFile(join(__dirname, `debug${name}.json`), JSON.stringify({ path, params, response: d }, null, 2)).catch(() => {});
  }
  return d;
}

// Responses differ slightly between endpoints; normalise defensively.
const listOf = (d) => (Array.isArray(d?.results) ? d.results : d?.results?.entities || d?.entities || []);
const norm = (e) => ({
  id: e.entity_id || e.id,
  name: e.name,
  type: (e.types && e.types[0]) || e.type || '',
  image: e.properties?.image?.url || e.image || null,
  description: e.properties?.short_description || e.properties?.description || '',
  year: e.properties?.release_year || null,
  affinity: e.query?.affinity ?? null,
  tags: (e.tags || []).slice(0, 5).map((t) => t.name).filter(Boolean),
  explain: e.query?.explainability || null,
});

async function search(q, type) {
  const d = await qloo('/search', { query: q, types: type, take: 6 });
  return listOf(d).map(norm).filter((e) => e.id && e.name);
}

async function recommend(seedIds, type, { take = 8 } = {}) {
  const base = { 'filter.type': type, 'signal.interests.entities': seedIds.join(','), take };
  let d;
  try {
    d = await qloo('/v2/insights', { ...base, 'feature.explainability': 'true' });
  } catch (e) {
    // If an optional parameter is rejected, retry with the minimal documented call.
    if (e.status !== 502) throw e;
    d = await qloo('/v2/insights', base);
  }
  // Never recommend back what the user already gave us.
  return listOf(d).map(norm).filter((x) => x.id && x.name && !seedIds.includes(x.id));
}

// The "agent": take a user's taste profile (mixed domains) and fan out
// cross-domain recommendations. Each target domain = one Qloo insights call.
async function plan(seeds, targets) {
  const ids = seeds.map((s) => s.id);
  const tasks = targets.map(async (type) => {
    try {
      const items = await recommend(ids, type);
      return { type, label: TYPES[type], items };
    } catch (e) {
      return { type, label: TYPES[type], items: [], error: e.message };
    }
  });
  return Promise.all(tasks);
}

// --- HTTP ---
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
};
const body = (req) =>
  new Promise((ok, no) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 20_000) { no(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { no(e); } });
  });

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/api/status') return json(res, 200, { keyConfigured: !!QLOO_KEY, types: TYPES });
      if (u.pathname === '/api/search') {
        const q = (u.searchParams.get('q') || '').trim().slice(0, 80);
        const type = u.searchParams.get('type') || '';
        if (q.length < 2) return json(res, 400, { error: 'query chhota hai' });
        if (type && !TYPES[type]) return json(res, 400, { error: 'invalid type' });
        return json(res, 200, { results: await search(q, type) });
      }
      if (u.pathname === '/api/recommend' && req.method === 'POST') {
        const b = await body(req);
        const seeds = (b.seeds || []).slice(0, 10).filter((s) => s?.id);
        const targets = (b.targets || []).filter((t) => TYPES[t]).slice(0, 5);
        if (!seeds.length || !targets.length) return json(res, 400, { error: 'seeds aur targets chahiye' });
        return json(res, 200, { sections: await plan(seeds, targets) });
      }
      // static
      let p = u.pathname === '/' ? '/index.html' : u.pathname;
      p = normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = join(__dirname, 'public', p);
      if (!file.startsWith(join(__dirname, 'public'))) return json(res, 403, { error: 'forbidden' });
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT') return json(res, 404, { error: 'not found' });
      json(res, e.status || 500, { error: e.message || 'server error' });
    }
  })
  .listen(PORT, () => console.log(`Taste Concierge: http://127.0.0.1:${PORT}  (key: ${QLOO_KEY ? 'ok' : 'MISSING'})`));
