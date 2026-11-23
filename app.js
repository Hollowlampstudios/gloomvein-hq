import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { todayStrip, platformCards, postsTable, accountsSection } from './render.js';
import { trendSnapshots } from './lib.js';

// Implicit flow: the link works even when it is opened on a different device from the one that asked for it.
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' },
});
const $ = (id) => document.getElementById(id);
const PAGE_URL = location.origin + location.pathname;
const PROJECT_LINK = 'https://supabase.com/dashboard/project/lrbrvcucomiygzbmvlwx';

let data = { snapshots: [], posts: [], statuses: [], accounts: [], kofi: [] };
let sortKey = 'newest';

async function load() {
  // The view does the week maths in the database: raw snapshots would be cut at 1000 rows (about 3.5 days).
  const [trends, posts, statuses, accounts, kofi] = await Promise.all([
    sb.from('metric_trends').select('*'),
    sb.from('posts').select('*').order('posted_at', { ascending: false, nullsFirst: false }).limit(200),
    sb.from('source_status').select('*'),
    sb.from('accounts').select('*'),
    sb.from('kofi').select('amount,currency,at'),
  ]);
  const failed = [trends, posts, statuses, accounts, kofi].find((r) => r.error);
  if (failed) {
    showProblem(failed.error.message);
    return;
  }
  $('problem').hidden = true;
  data = { snapshots: trendSnapshots(trends.data), posts: posts.data, statuses: statuses.data, accounts: accounts.data, kofi: kofi.data };
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
  $('platforms').innerHTML = platformCards(data.snapshots, data.statuses, now);
  renderPosts();
  $('accounts').innerHTML = accountsSection(data.accounts);
  filterAccounts();
  $('updated').textContent = `Loaded ${now.toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' })}. The data itself updates every hour.`;
}

function renderPosts() {
  $('posts').innerHTML = postsTable(data.posts, sortKey);
  for (const b of document.querySelectorAll('[data-sort]')) b.classList.toggle('on', b.dataset.sort === sortKey);
}

function filterAccounts() {
  const q = $('search').value.trim().toLowerCase();
  for (const a of document.querySelectorAll('.acct')) a.hidden = q !== '' && !a.dataset.search.includes(q);
  for (const g of document.querySelectorAll('.acct-group')) g.hidden = ![...g.querySelectorAll('.acct')].some((a) => !a.hidden);
}

async function saveManual(e) {
  e.preventDefault();
  const where = $('m-where').value;
  const group = $('m-group').value.trim();
  if (where === 'fb-group' && !group) { $('m-msg').textContent = 'Give the group a name.'; return; }
  const n = (id) => ($(id).value === '' ? null : Number($(id).value));
  const row = {
    platform: where === 'reddit' ? 'reddit' : `fb-group:${group}`,
    post_id: $('m-url').value.trim(),
    url: $('m-url').value.trim(),
    caption: $('m-caption').value.trim() || null,
    posted_at: $('m-date').value ? new Date($('m-date').value + 'T12:00:00+02:00').toISOString() : null,
    views: n('m-views'), likes: n('m-likes'), comments: n('m-comments'),
    origin: 'manual', updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('posts').upsert(row, { onConflict: 'platform,post_id' });
  $('m-msg').textContent = error ? `Not saved: ${error.message}` : 'Saved.';
  if (!error) load();
}

function showLogin() {
  $('login').hidden = false; $('app').hidden = true; $('signout').hidden = true;
}

let timer;
function showApp() {
  $('login').hidden = true; $('app').hidden = false; $('signout').hidden = false;
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
$('m-where').addEventListener('change', () => { $('m-group-label').hidden = $('m-where').value !== 'fb-group'; });
for (const b of document.querySelectorAll('[data-sort]')) b.addEventListener('click', () => { sortKey = b.dataset.sort; renderPosts(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) load(); });

sb.auth.onAuthStateChange((_event, session) => (session ? showApp() : showLogin()));
