// Pure helpers for the page: no DOM, no Supabase. Times are shown in SAST (UTC+2, no daylight saving).

const SAST_MS = 2 * 3600e3;
const DAY_MS = 24 * 3600e3;
const STALE_MS = 3 * 3600e3;
const LAUNCH = Date.parse('2026-12-01T00:00:00+02:00');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CATEGORIES = ['Accounts & files', 'Backend & site', 'Store & money', 'Social', 'Art & audio'];

const rowsOf = (snapshots, source, metric) =>
  snapshots
    .filter((s) => s.source === source && s.metric === metric && s.value != null)
    .sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at));

export function latest(snapshots, source, metric) {
  const rows = rowsOf(snapshots, source, metric);
  return rows.length ? Number(rows[0].value) : null;
}

export function weekTrend(snapshots, source, metric, now) {
  const rows = rowsOf(snapshots, source, metric);
  const cutoff = now.getTime() - 7 * DAY_MS;
  const current = rows.length ? Number(rows[0].value) : null;
  const old = rows.find((r) => Date.parse(r.taken_at) <= cutoff);
  const previous = old ? Number(old.value) : null;
  const delta = current == null || previous == null ? null : current - previous;
  return { current, previous, delta };
}

export function formatDelta(delta) {
  if (delta == null || !Number.isFinite(delta)) return '–';
  return delta > 0 ? `+${delta}` : String(delta);
}

export function formatSast(iso) {
  const d = new Date(Date.parse(iso) + SAST_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`;
}

export function staleText(status, now, maxAgeMs = STALE_MS) {
  if (!status || status.state === 'not_set_up') return 'not set up';
  if (!status.last_ok) return status.state === 'error' ? 'not working yet' : '';
  if (status.state === 'error') return status.last_error_at ? `error since ${formatSast(status.last_error_at)}` : 'error';
  if (now.getTime() - Date.parse(status.last_ok) > maxAgeMs) return `stale since ${formatSast(status.last_ok)}`;
  return '';
}

export function sortPosts(posts, key) {
  const val = key === 'newest' ? (p) => (p.posted_at ? Date.parse(p.posted_at) : null) : (p) => p[key] ?? null;
  return [...posts].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  });
}

export function groupAccounts(accounts) {
  const extra = [...new Set(accounts.map((a) => a.category))].filter((c) => !CATEGORIES.includes(c));
  return [...CATEGORIES, ...extra]
    .map((category) => ({
      category,
      items: accounts.filter((a) => a.category === category).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    }))
    .filter((g) => g.items.length);
}

export function daysToLaunch(now) {
  return Math.max(0, Math.ceil((LAUNCH - now.getTime()) / DAY_MS));
}

// Rows of the metric_trends view -> the latest and week-old snapshots per metric, for latest() and weekTrend().
export function trendSnapshots(rows) {
  return rows.flatMap((r) => [
    { source: r.source, metric: r.metric, value: r.current, taken_at: r.taken_at },
    ...(r.previous == null ? [] : [{ source: r.source, metric: r.metric, value: r.previous, taken_at: r.previous_at }]),
  ]);
}

// Facebook shows watch time as "10m 47s"; it is stored as seconds. A bare number counts as seconds.
export function parseDuration(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = [...t.matchAll(/(\d+)\s*([hms])/g)];
  if (!parts.length || t.replace(/(\d+)\s*([hms])/g, '').trim() !== '') return null;
  return parts.reduce((sum, [, n, u]) => sum + Number(n) * { h: 3600, m: 60, s: 1 }[u], 0);
}

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '–';
  const s = Number(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return [h && `${h}h`, m && `${m}m`, (r || (!h && !m)) && !h ? `${r}s` : ''].filter(Boolean).join(' ');
}

// Facebook's "Distribution" column: "+0.6x" -> 0.6.
export function parseMultiplier(text) {
  const m = String(text ?? '').trim().match(/^([+-]?\d+(?:\.\d+)?)\s*x?$/i);
  return m ? Number(m[1]) : null;
}

export function formatMultiplier(n) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return `${Number(n) > 0 ? '+' : ''}${Number(n)}x`;
}
