import { query } from '../db/client.js';
import { publishPost } from './facebookService.js';

/**
 * Approve a post and publish it to Facebook. Shared by the dashboard route and
 * the one-tap notification endpoint.
 *
 * Idempotent against stale taps: if the post is already approved or published,
 * it returns without publishing again (so tapping an old notification twice
 * can't double-post). A previously `failed` post can be retried.
 *
 * @returns {Promise<{ ok: boolean, post?: object, already?: boolean,
 *   notFound?: boolean, status?: string, fbPostId?: string, error?: string }>}
 */
export async function approveAndPublish(postId) {
  const { rows } = await query('SELECT * FROM posts WHERE id = $1', [postId]);
  const post = rows[0];
  if (!post) return { ok: false, notFound: true, error: 'Post not found' };

  if (post.status === 'approved' || post.status === 'published') {
    return { ok: post.status === 'published', already: true, status: post.status, post };
  }

  await query("UPDATE posts SET status = 'approved' WHERE id = $1", [post.id]);
  const result = await publishPost(post);
  const { rows: updated } = await query('SELECT * FROM posts WHERE id = $1', [post.id]);
  return { ...result, post: updated[0] };
}

/**
 * Reject a pending post. Idempotent: rejecting an already-resolved post is a
 * no-op that reports the current state rather than erroring.
 */
export async function rejectDraft(postId) {
  const { rows } = await query('SELECT * FROM posts WHERE id = $1', [postId]);
  const post = rows[0];
  if (!post) return { ok: false, notFound: true, error: 'Post not found' };

  if (post.status === 'published' || post.status === 'approved') {
    // Already went live — can't reject.
    return { ok: false, already: true, status: post.status, post };
  }
  if (post.status === 'rejected') {
    return { ok: true, already: true, status: post.status, post };
  }

  const { rows: updated } = await query(
    "UPDATE posts SET status = 'rejected' WHERE id = $1 RETURNING *",
    [post.id]
  );
  return { ok: true, post: updated[0] };
}
