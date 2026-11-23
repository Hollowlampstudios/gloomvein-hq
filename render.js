// Builds the page's HTML strings. No Supabase calls, no DOM: every text value goes through escapeHtml.
import { latest, weekTrend, formatDelta, formatSast, staleText, sortPosts, groupAccounts, daysToLaunch, formatDuration, formatMultiplier } from './lib.js';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const safeUrl = (u) => (/^https:\/\//i.test(u ?? '') ? escapeHtml(u) : '');
const DAILY_STALE_MS = 26 * 3600e3;
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));

const PLATFORMS = [
  { name: 'YouTube', status: ['youtube'], metrics: [['youtube', 'subscribers', 'subs'], ['youtube', 'views', 'views']] },
  { name: 'TikTok', status: ['tiktok', 'metricool'], metrics: [['tiktok', 'followers', 'followers']] },
  { name: 'Instagram', status: ['instagram', 'metricool'], metrics: [['instagram', 'followers', 'followers']] },
  { name: 'Facebook Page', status: ['facebook', 'metricool'], metrics: [['facebook', 'followers', 'followers']] },
  { name: 'Bluesky', status: ['bluesky'], metrics: [['bluesky', 'followers', 'followers']] },
  { name: 'Discord', status: ['discord'], metrics: [['discord', 'members', 'members'], ['discord', 'online', 'online']] },
  { name: 'itch.io', status: ['itch'], metrics: [['itch', 'views', 'views'], ['itch', 'downloads', 'downloads']] },
  { name: 'Website', status: ['site'], metrics: [['site', 'visits_today', 'visits today'], ['site', 'visits_total', 'visits this year']] },
  { name: 'Game', status: ['game'], metrics: [['game', 'players', 'players'], ['game', 'wishlist', 'wishlist'], ['game', 'events24h', 'events (24 h)']] },
];

// A card can be fed by its own source or by the daily Metricool run: use the first one that is set up.
function statusFor(names, statuses) {
  const found = names.map((n) => statuses.find((s) => s.source === n)).filter(Boolean);
  return found.find((s) => s.state === 'ok') ?? found.find((s) => s.state !== 'not_set_up') ?? found[0];
}

function stat(label, value, delta) {
  // No trend without a value; "–" (grey) until there is a value from a week ago.
  const dir = delta == null ? 'none' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'none';
  const d = delta === undefined || value == null ? '' : `<span class="delta ${dir}" title="change in 7 days">${escapeHtml(formatDelta(delta))}</span>`;
  return `<div class="stat"><b>${escapeHtml(fmt(value))}</b>${d}<small>${escapeHtml(label)}</small></div>`;
}

export function todayStrip(snapshots, kofiRows, now) {
  const days = daysToLaunch(now);
  const launch = days > 0 ? `launch in ${days} day${days === 1 ? '' : 's'}` : 'launched on 1 December';
  const itch = weekTrend(snapshots, 'itch', 'views', now);
  const totals = {};
  for (const k of kofiRows) totals[k.currency ?? ''] = (totals[k.currency ?? ''] ?? 0) + Number(k.amount || 0);
  const kofi = Object.entries(totals).map(([c, v]) => `${c} ${Math.round(v * 100) / 100}`.trim()).join(' + ') || '0';
  return `<p class="launch">${escapeHtml(launch)}</p>
<div class="strip">
${stat('itch views', itch.current, itch.delta)}
${stat('downloads', latest(snapshots, 'itch', 'downloads'))}
${stat('site visits today', latest(snapshots, 'site', 'visits_today'))}
${stat('Discord members', latest(snapshots, 'discord', 'members'))}
${stat('players', latest(snapshots, 'game', 'players'))}
${stat('wishlist', latest(snapshots, 'game', 'wishlist'))}
<div class="stat"><b>${escapeHtml(kofi)}</b><small>Ko-fi</small></div>
</div>`;
}

export function platformCards(snapshots, statuses, now) {
  return PLATFORMS.map((p) => {
    const status = statusFor(p.status, statuses);
    // The Metricool run is daily: allow a day plus slack before calling it stale.
    const note = staleText(status, now, status?.source === 'metricool' ? DAILY_STALE_MS : undefined);
    const stats = p.metrics.map(([source, metric, label]) => {
      const t = weekTrend(snapshots, source, metric, now);
      return stat(label, t.current, t.delta);
    }).join('');
    return `<article class="card${note ? ' stale' : ''}"><h3>${escapeHtml(p.name)}</h3>
<div class="stats">${stats}</div>${note ? `<p class="note"${status?.state === 'error' && status.last_error ? ` title="${escapeHtml(status.last_error)}"` : ''}>${escapeHtml(note)}</p>` : ''}</article>`;
  }).join('\n');
}

const PLATFORM_LABEL = { youtube: 'YT', tiktok: 'TikTok', instagram: 'IG', facebook: 'FB', bluesky: 'Bsky', reddit: 'Reddit' };

const platformLabel = (platform) =>
  PLATFORM_LABEL[platform] ?? (platform?.startsWith('fb-group:') ? `FB group ${platform.slice(9)}` : platform);

export const manualPosts = (posts) => posts.filter((p) => p.origin === 'manual');

// Facebook's extra columns, shown only when they were entered.
function extras(p) {
  const n = (v, label) => (v == null ? null : `${fmt(v)} ${label}`);
  return [
    n(p.reach, 'viewers'), n(p.impressions, 'impressions'), n(p.engagement, 'engagement'), n(p.follows, 'follows'),
    p.distribution == null ? null : `distribution ${formatMultiplier(p.distribution)}`,
    p.watch_seconds == null ? null : `watched ${formatDuration(p.watch_seconds)}`,
    p.avg_watch_seconds == null ? null : `avg ${formatDuration(p.avg_watch_seconds)}`,
    n(p.views_3s, 'three-second views'), n(p.views_1m, 'one-minute views'),
  ].filter(Boolean).join(' · ');
}

// The hand-entered posts under the form; buttons carry the index into manualPosts(posts).
export function manualList(posts) {
  const rows = manualPosts(posts).map((p, i) => `<li><span><b>${escapeHtml(platformLabel(p.platform))}</b>
${escapeHtml(p.caption || p.post_id)} <small>${escapeHtml(fmt(p.views))} views · ${escapeHtml(fmt(p.likes))} likes · ${escapeHtml(fmt(p.comments))} comments</small>${extras(p) ? `<small>${escapeHtml(extras(p))}</small>` : ''}</span>
<span class="acts"><button type="button" data-edit="${i}">Edit</button><button type="button" data-delete="${i}">Delete</button></span></li>`);
  return rows.length ? `<ul class="manual-list">${rows.join('')}</ul>` : '<p class="note">No numbers added by hand yet.</p>';
}

export function postsTable(posts, sortKey) {
  const rows = sortPosts(posts, sortKey).map((p) => {
    const label = platformLabel(p.platform);
    const when = p.posted_at ? formatSast(p.posted_at).split(' ').slice(0, 2).join(' ') : '';
    const caption = (p.caption ?? '').replace(/\s+/g, ' ');
    const short = caption.length > 90 ? caption.slice(0, 89) + '…' : caption;
    const url = safeUrl(p.url);
    return `<tr><td>${escapeHtml(when)}</td><td>${escapeHtml(label)}</td><td class="cap">${escapeHtml(short)}</td>
<td class="n">${escapeHtml(fmt(p.views))}</td><td class="n">${escapeHtml(fmt(p.likes))}</td><td class="n">${escapeHtml(fmt(p.comments))}</td>
<td>${url ? `<a href="${url}" target="_blank" rel="noopener">open</a>` : ''}</td></tr>`;
  }).join('\n');
  return `<table class="posts"><thead><tr><th>Date</th><th>Where</th><th>Post</th><th class="n">Views</th><th class="n">Likes</th><th class="n">Comments</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" class="empty">No posts yet.</td></tr>'}</tbody></table>`;
}

export function accountsSection(accounts) {
  return groupAccounts(accounts).map(({ category, items }) => `<section class="acct-group"><h3>${escapeHtml(category)}</h3>
<div class="acct-grid">${items.map((a) => {
    const search = escapeHtml(`${a.name} ${a.purpose ?? ''} ${a.login ?? ''}`.toLowerCase());
    const badge = a.status && a.status !== 'live' ? ` <span class="badge">${escapeHtml(a.status)}</span>` : '';
    return `<a class="acct" href="${safeUrl(a.url) || '#'}" target="_blank" rel="noopener" data-search="${search}">
<strong>${escapeHtml(a.name)}${badge}</strong><span>${escapeHtml(a.purpose ?? '')}</span><small>${escapeHtml(a.login ?? '')}</small></a>`;
  }).join('\n')}</div></section>`).join('\n');
}

// "All posts": every platform added up (API, Metricool and hand-entered), plus views per platform.
export function totalsStrip(rows) {
  const sum = (k) => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
  const byPlace = {};
  for (const r of rows) {
    const place = r.platform?.startsWith('fb-group:') ? 'FB groups' : platformLabel(r.platform);
    byPlace[place] = (byPlace[place] ?? 0) + Number(r.views || 0);
  }
  const breakdown = Object.entries(byPlace).sort((a, b) => b[1] - a[1]).map(([p, v]) => `${p} ${fmt(v)}`).join(' · ');
  return `<div class="strip">
${stat('posts', sum('posts'))}
${stat('views', sum('views'))}
${stat('likes', sum('likes'))}
${stat('comments', sum('comments'))}
${stat('reposts / shares', sum('shares'))}
</div>${breakdown ? `<p class="note">Views by place: ${escapeHtml(breakdown)}</p>` : ''}`;
}
