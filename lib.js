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
