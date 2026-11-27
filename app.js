import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=6671923c-1795786057';
import { todayStrip, platformCards, postsTable, accountsSection, manualList, manualPosts, totalsStrip, outreachSummary, outreachCards } from './render.js?v=6671923c-1795786057';
import { trendSnapshots, parseDuration, formatDuration, parseMultiplier, formatMultiplier, staleText, attachMessages } from './lib.js?v=6671923c-1795786057';

// Implicit flow: the link works even when it is opened on a different device from the one that asked for it.
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' },
});
const $ = (id) => document.getElementById(id);
const PAGE_URL = location.origin + location.pathname;
const PROJECT_LINK = 'https://supabase.com/dashboard/project/lrbrvcucomiygzbmvlwx';

let data = { snapshots: [], posts: [], statuses: [], accounts: [], kofi: [], totals: [], outreach: [] };
let sortKey = 'newest';
let outreachFilter = 'all';

async function load() {
  // The view does the week maths in the database: raw snapshots would be cut at 1000 rows (about 3.5 days).
  const [trends, posts, statuses, accounts, kofi, totals, outreach, messages] = await Promise.all([
    sb.from('metric_trends').select('*'),
    sb.from('posts').select('*').order('posted_at', { ascending: false, nullsFirst: false }).limit(200),
    sb.from('source_status').select('*'),
    sb.from('accounts').select('*'),
    sb.from('kofi').select('amount,currency,at'),
    sb.from('post_totals').select('*'),
    sb.from('outreach').select('*'),
    sb.from('outreach_messages').select('*').order('sent_at', { ascending: true }),
  ]);
  const failed = [trends, posts, statuses, accounts, kofi, totals, outreach, messages].find((r) => r.error);
  if (failed) {
    showProblem(failed.error.message);
    return;
  }
  $('problem').hidden = true;
  data = { snapshots: trendSnapshots(trends.data), posts: posts.data, statuses: statuses.data, accounts: accounts.data, kofi: kofi.data, totals: totals.data, outreach: attachMessages(outreach.data, messages.data) };
  render();
}

function showProblem(message) {
  const p = $('problem');
  p.hidden = false;
  p.textContent = `Couldn't load the data (${message}). If the Supabase project is paused, restore it: `;
  const a = document.createElement('a');
  a.href = PROJECT_LINK; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'open the project';
  p.append(a);
}

function render() {
  const now = new Date();
  $('today').innerHTML = todayStrip(data.snapshots, data.kofi, now);
  $('totals').innerHTML = totalsStrip(data.totals);
  $('platforms').innerHTML = platformCards(data.snapshots, data.statuses, now);
  renderPosts();
  $('m-list').innerHTML = manualList(data.posts);
  $('accounts').innerHTML = accountsSection(data.accounts);
  filterAccounts();
  renderOutreach();
  $('updated').textContent = `Loaded ${now.toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' })}. The data itself updates every hour.`;
}

function renderOutreach() {
  const now = new Date();
  $('o-summary').innerHTML = outreachSummary(data.outreach, now);
  // Keep a half-typed note: don't redraw the cards while one of their fields has focus.
  if (!$('o-cards').contains(document.activeElement)) $('o-cards').innerHTML = outreachCards(data.outreach, outreachFilter, now);
  for (const b of document.querySelectorAll('[data-ofilter]')) b.classList.toggle('on', b.dataset.ofilter === outreachFilter);
  const st = data.statuses.find((s) => s.source === 'outreach');
  const stale = staleText(st, now, 26 * 3600e3);
  $('o-status').textContent = stale ? `Inbox check: ${stale}.` : st?.last_ok ? `Inbox last checked ${new Date(st.last_ok).toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' })}.` : '';
}

async function saveOutreach(e) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('.o-msg');
  const video = form.video.value.trim();
  if (video && !/^https:\/\//i.test(video)) { msg.textContent = 'The link must start with https://'; return; }
  msg.textContent = 'Saving…';
  const { error } = await sb.from('outreach').update({ video_url: video || null, notes: form.notes.value.trim() || null }).eq('email', form.dataset.email);
  msg.textContent = error ? `Not saved: ${error.message}` : 'Saved.';
  if (!error) { document.activeElement?.blur(); load(); }
}

// Two views on one page: #outreach opens the tracker, anything else the dashboard (so a bookmark keeps its view).
function showView() {
  const view = location.hash === '#outreach' ? 'outreach' : 'dash';
  $('view-outreach').hidden = view !== 'outreach';
  $('view-dash').hidden = view !== 'dash';
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === view);
}

function renderPosts() {
  $('posts').innerHTML = postsTable(data.posts, sortKey);
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
  history.replaceState(null, '', b.dataset.view === 'outreach' ? '#outreach' : location.pathname);
  showView();
  scrollTo(0, 0);
});
window.addEventListener('hashchange', showView);
for (const b of document.querySelectorAll('[data-ofilter]')) b.addEventListener('click', () => { outreachFilter = b.dataset.ofilter; document.activeElement?.blur(); renderOutreach(); });
$('o-cards').addEventListener('submit', (e) => { if (e.target.matches('.o-form')) saveOutreach(e); });
for (const b of document.querySelectorAll('[data-sort]')) b.classList.toggle('on', b.dataset.sort === sortKey);
}

function filterAccounts() {
  const q = $('search').value.trim().toLowerCase();
  for (const a of document.querySelectorAll('.acct')) a.hidden = q !== '' && !a.dataset.search.includes(q);
  for (const g of document.querySelectorAll('.acct-group')) g.hidden = ![...g.querySelectorAll('.acct')].some((a) => !a.hidden);
}

let editing = null; // the {platform, post_id} being edited, so a changed link replaces the old entry

const EXTRA_NUMBERS = { 'm-reach': 'reach', 'm-impressions': 'impressions', 'm-engagement': 'engagement', 'm-follows': 'follows', 'm-3s': 'views_3s', 'm-1m': 'views_1m' };
const MANUAL_FIELDS = ['m-url', 'm-caption', 'm-date', 'm-views', 'm-likes', 'm-comments', 'm-distribution', 'm-watch', 'm-avgwatch', ...Object.keys(EXTRA_NUMBERS)];
function clearManual() {
  for (const id of MANUAL_FIELDS) $(id).value = ''; // "where" and the group name stay for the next post
  editing = null;
  $('m-save').textContent = 'Save';
}

async function saveManual(e) {
  e.preventDefault();
  const where = $('m-where').value;
  const group = $('m-group').value.trim();
  if (where === 'fb-group' && !group) { $('m-msg').textContent = 'Give the group a name.'; return; }
  const n = (id) => ($(id).value === '' ? null : Number($(id).value));
  const text = (id) => $(id).value.trim();
  const watch = parseDuration(text('m-watch')), avg = parseDuration(text('m-avgwatch')), dist = parseMultiplier(text('m-distribution'));
  if ((text('m-watch') && watch == null) || (text('m-avgwatch') && avg == null)) { $('m-msg').textContent = 'Write watch times like 10m 47s or 8s.'; return; }
  if (text('m-distribution') && dist == null) { $('m-msg').textContent = 'Write distribution like +0.6x.'; return; }
  const row = {
    platform: where === 'reddit' ? 'reddit' : `fb-group:${group}`,
    post_id: $('m-url').value.trim(),
    url: $('m-url').value.trim(),
    caption: $('m-caption').value.trim() || null,
    posted_at: $('m-date').value ? new Date($('m-date').value + 'T12:00:00+02:00').toISOString() : null,
    views: n('m-views'), likes: n('m-likes'), comments: n('m-comments'),
    ...Object.fromEntries(Object.entries(EXTRA_NUMBERS).map(([id, col]) => [col, n(id)])),
    distribution: dist, watch_seconds: watch, avg_watch_seconds: avg,
    origin: 'manual', updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('posts').upsert(row, { onConflict: 'platform,post_id' });
  if (error) { $('m-msg').textContent = `Not saved: ${error.message}`; return; }
  if (editing && (editing.platform !== row.platform || editing.post_id !== row.post_id)) {
    await sb.from('posts').delete().match({ platform: editing.platform, post_id: editing.post_id, origin: 'manual' });
  }
  $('m-msg').textContent = `Saved "${row.caption ?? row.url}". It is in "Your entries" below and in the Posts list. Add the next one.`;
  clearManual();
  load();
}

function editManual(p) {
  const group = p.platform.startsWith('fb-group:');
  $('m-where').value = group ? 'fb-group' : 'reddit';
  $('m-group-label').hidden = !group;
  $('m-group').value = group ? p.platform.slice(9) : '';
  $('m-url').value = p.post_id;
  $('m-caption').value = p.caption ?? '';
  $('m-date').value = p.posted_at ? new Date(Date.parse(p.posted_at) + 2 * 3600e3).toISOString().slice(0, 10) : '';
  $('m-views').value = p.views ?? '';
  $('m-likes').value = p.likes ?? '';
  $('m-comments').value = p.comments ?? '';
  for (const [id, col] of Object.entries(EXTRA_NUMBERS)) $(id).value = p[col] ?? '';
  $('m-distribution').value = p.distribution == null ? '' : formatMultiplier(p.distribution);
  $('m-watch').value = p.watch_seconds == null ? '' : formatDuration(p.watch_seconds);
  $('m-avgwatch').value = p.avg_watch_seconds == null ? '' : formatDuration(p.avg_watch_seconds);
  $('m-more').open = Object.values(EXTRA_NUMBERS).some((c) => p[c] != null) || p.watch_seconds != null;
  editing = { platform: p.platform, post_id: p.post_id };
  $('m-save').textContent = 'Save changes';
  $('m-msg').textContent = 'Editing: change the numbers and save.';
  $('m-url').scrollIntoView({ block: 'center' });
}

async function onManualList(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const p = manualPosts(data.posts)[Number(b.dataset.edit ?? b.dataset.delete)];
  if (!p) return;
  if (b.dataset.edit !== undefined) return editManual(p);
  if (!confirm(`Delete "${p.caption ?? p.post_id}"?`)) return;
  const { error } = await sb.from('posts').delete().match({ platform: p.platform, post_id: p.post_id, origin: 'manual' });
  $('m-msg').textContent = error ? `Not deleted: ${error.message}` : 'Deleted.';
  if (editing?.post_id === p.post_id) clearManual();
  load();
}

function showLogin() {
  $('login').hidden = false; $('app').hidden = true; $('nav').hidden = true;
}

let timer;
function showApp() {
  $('login').hidden = true; $('app').hidden = false; $('nav').hidden = false;
  showView();
  load();
  clearInterval(timer);
  timer = setInterval(load, 5 * 60e3);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-msg').textContent = 'Sending…';
  // shouldCreateUser false: the page never makes accounts for strangers.
  const { error } = await sb.auth.signInWithOtp({
    email: $('email').value.trim(),
    options: { emailRedirectTo: PAGE_URL, shouldCreateUser: false },
  });
  $('login-msg').textContent = error ? `That didn't work: ${error.message}` : 'Check your email and open the link.';
});
$('signout').addEventListener('click', () => sb.auth.signOut());
$('search').addEventListener('input', filterAccounts);
$('manual').addEventListener('submit', saveManual);
$('m-list').addEventListener('click', onManualList);
$('m-where').addEventListener('change', () => { $('m-group-label').hidden = $('m-where').value !== 'fb-group'; });
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
  history.replaceState(null, '', b.dataset.view === 'outreach' ? '#outreach' : location.pathname);
  showView();
  scrollTo(0, 0);
});
window.addEventListener('hashchange', showView);
for (const b of document.querySelectorAll('[data-ofilter]')) b.addEventListener('click', () => { outreachFilter = b.dataset.ofilter; document.activeElement?.blur(); renderOutreach(); });
$('o-cards').addEventListener('submit', (e) => { if (e.target.matches('.o-form')) saveOutreach(e); });
for (const b of document.querySelectorAll('[data-sort]')) b.addEventListener('click', () => { sortKey = b.dataset.sort; renderPosts(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) load(); });

sb.auth.onAuthStateChange((_event, session) => (session ? showApp() : showLogin()));
