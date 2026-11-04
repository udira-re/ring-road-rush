// Ring Road Rush API. Static files in /public are served by Cloudflare directly;
// only /api/* reaches this code.
const NPT_MS = 20700000; // Nepal is UTC+5:45
const DAY_MS = 86400000;
const CAUSES = new Set(['cow', 'micro', 'tempo', 'truck', 'dog', 'dig', 'bike', 'cycle', 'walker', 'bridge', 'wall', 'bus']);
const DEVICES = new Set(['phone', 'computer']);
const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

const nepalDay = (now = Date.now()) => Math.floor((now + NPT_MS) / DAY_MS);
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const inRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function validate(body) {
  if (!body || typeof body !== 'object') return 'Send a JSON object.';
  if (typeof body.player !== 'string' || !ID_PATTERN.test(body.player)) return 'player must be a random ID.';
  if (body.type !== 'start' && body.type !== 'end') return 'type must be start or end.';
  if (!Number.isInteger(body.road) || body.road < 1 || body.road > 100000) return 'road must be a road number.';
  if (!DEVICES.has(body.device)) return 'device must be phone or computer.';
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 24)) return 'name must be 24 characters or fewer.';
  if (body.type === 'end') {
    if (!inRange(body.km, 0, 500)) return 'km is out of range.';
    if (!Number.isInteger(body.score) || !inRange(body.score, 0, 1000000)) return 'score is out of range.';
    if (!Number.isInteger(body.momos) || !inRange(body.momos, 0, 20000)) return 'momos is out of range.';
    if (!CAUSES.has(body.cause)) return 'cause is not a known crash type.';
  }
  return null;
}

async function saveEvent(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send valid JSON.' }, 400); }
  const problem = validate(body);
  if (problem) return json({ error: problem }, 422);
  const end = body.type === 'end';
  const name = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO events (player_id, type, day, road, device, km, score, momos, cause, created_at, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(body.player, body.type, nepalDay(), body.road, body.device,
      end ? body.km : null, end ? body.score : null, end ? body.momos : null, end ? body.cause : null, now, name || null),
    // One row per rider: their current name and when they were first and last seen.
    env.DB.prepare(
      `INSERT INTO riders (player_id, name, first_seen, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT (player_id) DO UPDATE SET name = COALESCE(excluded.name, riders.name), last_seen = excluded.last_seen`
    ).bind(body.player, name || null, now, now)
  ]);
  return json({ ok: true }, 201);
}

async function stats(env) {
  const today = nepalDay();
  const totalsQ = `SELECT COUNT(DISTINCT player_id) AS players, COUNT(*) AS plays FROM events WHERE type = 'start'`;
  const [totals, todayRow, returning, lengths, causes, devices, days] = await env.DB.batch([
    env.DB.prepare(totalsQ),
    env.DB.prepare(totalsQ + ' AND day = ?').bind(today),
    env.DB.prepare(`SELECT COUNT(*) AS players FROM (
      SELECT player_id FROM events WHERE type = 'start' GROUP BY player_id HAVING COUNT(DISTINCT day) > 1)`),
    env.DB.prepare(`SELECT ROUND(AVG(km), 1) AS avg_km, MAX(score) AS top_score, COUNT(*) AS finished,
      SUM(CASE WHEN km >= 27 THEN 1 ELSE 0 END) AS laps FROM events WHERE type = 'end'`),
    env.DB.prepare(`SELECT cause, COUNT(*) AS rides FROM events WHERE type = 'end' GROUP BY cause ORDER BY rides DESC`),
    env.DB.prepare(`SELECT device, COUNT(DISTINCT player_id) AS players FROM events WHERE type = 'start' GROUP BY device ORDER BY players DESC`),
    env.DB.prepare(`SELECT day, COUNT(DISTINCT player_id) AS players, COUNT(*) AS plays FROM events
      WHERE type = 'start' AND day > ? GROUP BY day ORDER BY day`).bind(today - 14)
  ]);
  const first = r => r.results[0] || {};
  const dayRows = new Map(days.results.map(d => [d.day, d]));
  const last14 = [];
  for (let d = today - 13; d <= today; d++) {
    const row = dayRows.get(d) || { players: 0, plays: 0 };
    last14.push({ date: new Date(d * DAY_MS).toISOString().slice(0, 10), players: row.players, plays: row.plays });
  }
  return json({
    all_time: first(totals), today: first(todayRow), returning_players: first(returning).players || 0,
    rides: { finished: first(lengths).finished || 0, average_km: first(lengths).avg_km || 0, top_score: first(lengths).top_score || 0, full_laps: first(lengths).laps || 0 },
    crashes: causes.results, devices: devices.results, last_14_days: last14
  }, 200, { 'Cache-Control': 'public, max-age=30' });
}

// Live riders: one row per rider on the road. A rider who stops updating drops off after a few seconds.
const LIVE_WINDOW_MS = 12000;
const liveList = (env, now) => env.DB.prepare(
  `SELECT substr(player_id, 1, 4) AS id, name, d, x, v FROM live WHERE updated_at > ? ORDER BY d DESC LIMIT 20`
).bind(now - LIVE_WINDOW_MS);
async function saveLive(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Send valid JSON.' }, 400); }
  if (!b || typeof b.player !== 'string' || !ID_PATTERN.test(b.player)) return json({ error: 'player must be a random ID.' }, 422);
  if (b.done === true) {
    await env.DB.prepare('DELETE FROM live WHERE player_id = ?').bind(b.player).run();
    return json({ ok: true });
  }
  if (!Number.isInteger(b.d) || !inRange(b.d, 0, 1000000) || !Number.isInteger(b.x) || !inRange(b.x, 0, 400) || !Number.isInteger(b.v) || !inRange(b.v, 0, 2000)) {
    return json({ error: 'Position is out of range.' }, 422);
  }
  if (b.name !== undefined && (typeof b.name !== 'string' || b.name.length > 24)) return json({ error: 'name must be 24 characters or fewer.' }, 422);
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  const now = Date.now();
  const [, list] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO live (player_id, name, d, x, v, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (player_id) DO UPDATE SET name = excluded.name, d = excluded.d, x = excluded.x, v = excluded.v, updated_at = excluded.updated_at`)
      .bind(b.player, name || null, b.d, b.x, b.v, now),
    liveList(env, now)
  ]);
  if (Math.random() < .01) await env.DB.prepare('DELETE FROM live WHERE updated_at < ?').bind(now - 3600000).run();
  return json({ riders: list.results });
}
async function readLive(env) {
  const { results } = await liveList(env, Date.now()).all();
  return json({ riders: results });
}

// Current weather codes, fetched here so players' browsers never contact a third party.
async function skyNow() {
  try {
    // Kathmandu, Mugling, Pokhara, Jomsom, Birgunj and Biratnagar: one for each level.
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=27.7172,27.855,28.2096,28.782,27.0104,26.4525&longitude=85.324,84.561,83.9856,83.729,84.877,87.2718&current=weather_code';
    const r = await fetch(url, { cf: { cacheTtl: 1200, cacheEverything: true } });
    if (!r.ok) throw new Error('weather ' + r.status);
    const d = await r.json();
    return json({ codes: d.map(p => p.current.weather_code) }, 200, { 'Cache-Control': 'public, max-age=600' });
  } catch {
    return json({ codes: [null, null, null, null, null, null] });
  }
}

// Ghost riders: each player's best ride of the day, replayed by other players.
const LAUNCH_DAY = Date.UTC(2026, 10, 2) / DAY_MS;
function validGhost(b) {
  if (!b || typeof b !== 'object') return 'Send a JSON object.';
  if (typeof b.player !== 'string' || !ID_PATTERN.test(b.player)) return 'player must be a random ID.';
  if (b.road !== nepalDay() - LAUNCH_DAY + 1) return "This ride is not from today's road.";
  if (!inRange(b.km, 0, 500)) return 'km is out of range.';
  if (!Number.isInteger(b.score) || !inRange(b.score, 0, 1000000)) return 'score is out of range.';
  if (b.name !== undefined && (typeof b.name !== 'string' || b.name.length > 24)) return 'name must be 24 characters or fewer.';
  const p = b.path;
  if (!Array.isArray(p) || p.length < 8 || p.length > 3000 || p.length % 2) return 'path has the wrong length.';
  for (let i = 0; i < p.length; i++) {
    if (!Number.isInteger(p[i]) || p[i] < 0 || p[i] > (i % 2 ? 400 : 1000000)) return 'path has a value out of range.';
  }
  return null;
}
async function saveGhost(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Send valid JSON.' }, 400); }
  const problem = validGhost(b);
  if (problem) return json({ error: problem }, 422);
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  await env.DB.prepare(
    `INSERT INTO ghosts (player_id, day, name, km, score, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id, day) DO UPDATE SET
       name = COALESCE(excluded.name, ghosts.name),
       km = CASE WHEN excluded.score > ghosts.score THEN excluded.km ELSE ghosts.km END,
       path = CASE WHEN excluded.score > ghosts.score THEN excluded.path ELSE ghosts.path END,
       created_at = CASE WHEN excluded.score > ghosts.score THEN excluded.created_at ELSE ghosts.created_at END,
       score = MAX(excluded.score, ghosts.score)`
  ).bind(b.player, nepalDay(), name || null, b.km, b.score, JSON.stringify(b.path), Date.now()).run();
  return json({ ok: true }, 201);
}
async function ghosts(env) {
  const { results } = await env.DB.prepare(
    `SELECT substr(player_id, 1, 4) AS id, name, km, score, path FROM ghosts WHERE day = ? ORDER BY km DESC LIMIT 6`
  ).bind(nepalDay()).all();
  return json({ ghosts: results.map(g => ({ ...g, path: JSON.parse(g.path) })) });
}

// Owner-only data needs the STATS_KEY secret. With no secret set, it stays closed to everyone.
async function ownerOnly(request, env) {
  const given = request.headers.get('x-stats-key') || '';
  const key = env.STATS_KEY || '';
  if (!key || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// The one public score: who holds today's best.
async function topRider(env) {
  const row = await env.DB.prepare(
    `SELECT r.name AS name, e.score AS score FROM events e LEFT JOIN riders r ON r.player_id = e.player_id
     WHERE e.type = 'end' AND e.day = ? ORDER BY e.score DESC LIMIT 1`
  ).bind(nepalDay()).first();
  return json({ top: row ? { name: row.name, score: row.score } : null }, 200, { 'Cache-Control': 'public, max-age=20' });
}

// Top scores for today and the last 7 days, using each rider's best ride.
async function leaderboard(env) {
  const q = `SELECT substr(e.player_id, 1, 4) AS id, r.name AS name, MAX(e.score) AS score, MAX(e.km) AS km
    FROM events e LEFT JOIN riders r ON r.player_id = e.player_id
    WHERE e.type = 'end' AND e.day >= ? GROUP BY e.player_id ORDER BY score DESC LIMIT 20`;
  const today = nepalDay();
  const [day, week] = await env.DB.batch([env.DB.prepare(q).bind(today), env.DB.prepare(q).bind(today - 6)]);
  return json({ today: day.results, week: week.results }, 200, { 'Cache-Control': 'public, max-age=20' });
}

// Player list for the stats page. Only a short ID leaves the server, never the full one.
async function players(env) {
  const [list, recent] = await env.DB.batch([
    env.DB.prepare(`SELECT
        substr(e.player_id, 1, 4) AS id,
        (SELECT n.name FROM events n WHERE n.player_id = e.player_id AND n.name IS NOT NULL ORDER BY n.id DESC LIMIT 1) AS name,
        SUM(CASE WHEN e.type = 'start' THEN 1 ELSE 0 END) AS rides,
        COUNT(DISTINCT e.day) AS days,
        MAX(e.km) AS best_km,
        MAX(e.score) AS best_score,
        COALESCE(SUM(e.momos), 0) AS momos,
        GROUP_CONCAT(DISTINCT e.device) AS devices,
        MIN(e.created_at) AS first_seen,
        MAX(e.created_at) AS last_seen
      FROM events e GROUP BY e.player_id ORDER BY last_seen DESC LIMIT 200`),
    env.DB.prepare(`SELECT
        substr(e.player_id, 1, 4) AS id,
        (SELECT n.name FROM events n WHERE n.player_id = e.player_id AND n.name IS NOT NULL ORDER BY n.id DESC LIMIT 1) AS name,
        e.road, e.km, e.score, e.momos, e.cause, e.device, e.created_at
      FROM events e WHERE e.type = 'end' ORDER BY e.id DESC LIMIT 50`)
  ]);
  return json({ players: list.results, recent_rides: recent.results }, 200, { 'Cache-Control': 'public, max-age=30' });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/api/events') {
        if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, { Allow: 'POST' });
        return await saveEvent(request, env);
      }
      if (pathname === '/api/top') {
        if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET' });
        return await topRider(env);
      }
      if (pathname === '/api/stats' || pathname === '/api/players' || pathname === '/api/leaderboard') {
        if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET' });
        if (!await ownerOnly(request, env)) return json({ error: 'This data is private.' }, 401);
        if (pathname === '/api/stats') return await stats(env);
        if (pathname === '/api/players') return await players(env);
        return await leaderboard(env);
      }
      if (pathname === '/api/live') {
        if (request.method === 'POST') return await saveLive(request, env);
        if (request.method === 'GET') return await readLive(env);
        return json({ error: 'Use GET or POST.' }, 405, { Allow: 'GET, POST' });
      }
      if (pathname === '/api/sky') return await skyNow();
      if (pathname === '/api/ghosts') {
        if (request.method === 'POST') return await saveGhost(request, env);
        if (request.method === 'GET') return await ghosts(env);
        return json({ error: 'Use GET or POST.' }, 405, { Allow: 'GET, POST' });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'The server could not finish that request.' }, 500);
    }
  }
};
