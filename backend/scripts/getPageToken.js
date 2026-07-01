// Mint a long-lived (effectively non-expiring) Facebook Page access token.
//
// The recurring "session has expired" problem comes from copying a SHORT-LIVED
// token straight out of the Graph API Explorer — it dies within hours, and any
// page token derived from it dies with it. This script does the two steps the
// Explorer UI makes easy to skip:
//
//   1. Exchange the short-lived USER token for a long-lived (~60 day) one.
//   2. Read /me/accounts with that long-lived token — the page token it returns
//      does NOT expire (as long as you stay a page admin and don't change your
//      password), which debug_token confirms with expires_at = 0.
//
// Usage:
//   1. In Graph API Explorer, pick your app + "Get User Access Token" with the
//      pages_manage_posts and pages_read_engagement scopes, and copy the token.
//   2. Set FB_APP_ID and FB_APP_SECRET in backend/.env
//      (developers.facebook.com -> your app -> Settings -> Basic).
//   3. Run:  node scripts/getPageToken.js <SHORT_LIVED_USER_TOKEN>
//
// It prints the permanent page token to paste into FB_PAGE_ACCESS_TOKEN on
// Railway (and your local .env).

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v21.0';

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function graph(path, params) {
  const url = `${GRAPH}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    die(body.error?.message || `Graph API error (HTTP ${res.status})`);
  }
  return body;
}

const shortToken = process.argv[2];
const appId = process.env.FB_APP_ID;
const appSecret = process.env.FB_APP_SECRET;
const wantPageId = process.env.FB_PAGE_ID;

if (!shortToken) die('Pass the short-lived user token: node scripts/getPageToken.js <TOKEN>');
if (!appId || !appSecret) die('Set FB_APP_ID and FB_APP_SECRET in backend/.env first.');

console.log('\n🔑 Step 1/3 — exchanging for a long-lived user token…');
const longLived = await graph('oauth/access_token', {
  grant_type: 'fb_exchange_token',
  client_id: appId,
  client_secret: appSecret,
  fb_exchange_token: shortToken,
});
const userToken = longLived.access_token;

console.log('📄 Step 2/3 — fetching your page tokens…');
const { data: pages } = await graph('me/accounts', {
  fields: 'name,access_token',
  access_token: userToken,
});
if (!pages?.length) die('No pages found for this user. Make sure you granted pages permissions.');

// Prefer the configured page; otherwise take the first (and list the rest).
const page = pages.find((p) => p.id === wantPageId) || pages[0];

console.log('🔍 Step 3/3 — confirming the page token never expires…');
const { data: info } = await graph('debug_token', {
  input_token: page.access_token,
  access_token: `${appId}|${appSecret}`,
});
const neverExpires = !info.expires_at || info.expires_at === 0;

console.log('\n──────────────────────────────────────────────────────');
console.log(`✅ Page: ${page.name} (${page.id})`);
console.log(`   Expires: ${neverExpires ? 'NEVER 🎉' : new Date(info.expires_at * 1000).toString()}`);
if (pages.length > 1) {
  console.log(`   (other pages available: ${pages.filter((p) => p !== page).map((p) => p.name).join(', ')})`);
}
console.log('\n📋 Paste this into FB_PAGE_ACCESS_TOKEN (Railway + local .env):\n');
console.log(page.access_token);
console.log('\n──────────────────────────────────────────────────────\n');

if (!neverExpires) {
  console.log('⚠️  This token still has an expiry. Re-check that you started from a');
  console.log('   freshly generated user token and that the app has the right scopes.\n');
}
