import { query } from '../db/client.js';

// NOTE: This app authenticates with a long-lived Facebook Page Access Token
// supplied via FB_PAGE_ACCESS_TOKEN. Long-lived page tokens do not expire on a
// fixed schedule, but the user token they derive from can, and Meta recommends
// refreshing roughly every 60 days. When publishing starts failing with an auth
// error, generate a fresh token and update the env var.
// Refresh docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/#pagetokens
const GRAPH_VERSION = 'v21.0';

function graphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

/**
 * Publish an approved post to the configured Facebook Page.
 * - With an image_url: posts a photo to /{PAGE_ID}/photos
 * - Text-only: posts to /{PAGE_ID}/feed
 * Updates the post row to `published` (with fb_post_id + published_at) on
 * success, or `failed` (with error_message) on any error.
 *
 * @param {{ id: number, content: string, image_url: string|null }} post
 * @returns {Promise<{ ok: boolean, fbPostId?: string, error?: string }>}
 */
export async function publishPost(post) {
  const pageId = process.env.FB_PAGE_ID;
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

  try {
    let endpoint;
    const params = new URLSearchParams();
    params.set('access_token', accessToken);

    if (post.image_url) {
      endpoint = graphUrl(`${pageId}/photos`);
      params.set('url', post.image_url);
      params.set('message', post.content);
    } else {
      endpoint = graphUrl(`${pageId}/feed`);
      params.set('message', post.content);
    }

    const response = await fetch(endpoint, { method: 'POST', body: params });
    const data = await response.json();

    if (!response.ok || data.error) {
      const message = data.error?.message || `Graph API error (${response.status})`;
      throw new Error(message);
    }

    // /photos returns { id, post_id }; /feed returns { id }
    const fbPostId = data.post_id || data.id;

    await query(
      `UPDATE posts
         SET status = 'published',
             fb_post_id = $1,
             published_at = NOW(),
             error_message = NULL
       WHERE id = $2`,
      [fbPostId, post.id]
    );

    return { ok: true, fbPostId };
  } catch (err) {
    const message = err.message || String(err);
    await query(
      `UPDATE posts
         SET status = 'failed',
             error_message = $1
       WHERE id = $2`,
      [message, post.id]
    );
    console.error(`[facebook] publish failed for post ${post.id}: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Inspect the configured page token via Graph's debug_token endpoint and report
 * when it expires. Used to warn the owner *before* the token lapses instead of
 * discovering it through a failed publish.
 *
 * debug_token needs an app-level token to inspect another token. If FB_APP_ID
 * and FB_APP_SECRET are set we use an app access token (the correct way);
 * otherwise we fall back to inspecting the token with itself, which works for a
 * token whose owner is a developer of the app and degrades gracefully if not.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   isValid?: boolean,
 *   neverExpires?: boolean,
 *   expiresAt?: string|null,   // ISO string, or null when it never expires
 *   daysRemaining?: number|null,
 *   error?: string
 * }>}
 */
export async function getTokenStatus() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'FB_PAGE_ACCESS_TOKEN is not set' };

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  const inspector = appId && appSecret ? `${appId}|${appSecret}` : token;

  try {
    const url =
      `${graphUrl('debug_token')}?input_token=${encodeURIComponent(token)}` +
      `&access_token=${encodeURIComponent(inspector)}`;
    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok || body.error || !body.data) {
      return { ok: false, error: body.error?.message || `HTTP ${response.status}` };
    }

    const data = body.data;
    // expires_at is a Unix timestamp in seconds; 0 means the token never expires.
    const neverExpires = !data.expires_at || data.expires_at === 0;
    const expiresAt = neverExpires ? null : new Date(data.expires_at * 1000);
    const daysRemaining = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
      : null;

    return {
      ok: true,
      isValid: Boolean(data.is_valid),
      neverExpires,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining,
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Lightweight connectivity/credential check for the Settings "token health"
 * panel. Confirms the page token can read the page object.
 */
export async function checkConnection() {
  const pageId = process.env.FB_PAGE_ID;
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    return { ok: false, error: 'FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN is not set' };
  }

  try {
    const url = `${graphUrl(pageId)}?fields=name&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.error) {
      return { ok: false, error: data.error?.message || `HTTP ${response.status}` };
    }
    return { ok: true, page: data.name };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
