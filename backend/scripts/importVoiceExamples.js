import 'dotenv/config';
import { pool, runMigrations } from '../src/db/client.js';

// Pulls recent posts from your Facebook Page and saves the text ones as
// voice_examples so the content agent learns your real tone.
//
// Usage:  node scripts/importVoiceExamples.js [limit]
//         (default limit 50; only posts with a text caption are kept)

const GRAPH_VERSION = 'v21.0';
const LIMIT = Number(process.argv[2] || 50);
const MIN_LENGTH = 40; // skip ultra-short / link-only posts

async function fetchPagePosts() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    throw new Error('FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN must be set in .env');
  }

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/posts` +
    `?fields=message,created_time&limit=${LIMIT}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Graph API: ${data.error.message}`);
  return data.data || [];
}

async function main() {
  console.log('→ Fetching recent posts from your Facebook Page…');
  const posts = await fetchPagePosts();

  const withText = posts.filter(
    (p) => p.message && p.message.trim().length >= MIN_LENGTH
  );
  console.log(
    `→ ${posts.length} posts returned, ${withText.length} have usable text.`
  );

  if (withText.length === 0) {
    console.log(
      'No text posts found. (Image/link-only posts have no caption to learn from.)'
    );
    await pool.end();
    return;
  }

  // Make sure the tables exist (idempotent), then insert, skipping duplicates.
  await runMigrations();

  let inserted = 0;
  for (const p of withText) {
    const content = p.message.trim();
    const { rows } = await pool.query(
      'SELECT 1 FROM voice_examples WHERE content = $1 LIMIT 1',
      [content]
    );
    if (rows.length) continue;

    await pool.query('INSERT INTO voice_examples (content) VALUES ($1)', [content]);
    inserted++;
    const preview = content.slice(0, 70).replace(/\s+/g, ' ');
    console.log(`   + ${preview}${content.length > 70 ? '…' : ''}`);
  }

  console.log(`\n✓ Imported ${inserted} new voice example(s).`);
  console.log('  Review/trim them anytime in the dashboard under Settings → Voice examples.');
  await pool.end();
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
