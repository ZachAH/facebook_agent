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
