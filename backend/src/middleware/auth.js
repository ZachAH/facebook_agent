import jwt from 'jsonwebtoken';

/**
 * Express middleware that validates a Bearer JWT against JWT_SECRET.
 * Rejects with 401 when the token is missing or invalid.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Capability token scope for one-tap post actions from a push notification.
const ACTION_SCOPE = 'post-action';

/**
 * Sign a token that authorizes approve/reject for a single post without a
 * login. Embedded in the push notification payload so the service worker can
 * act on it directly.
 */
export function signActionToken(postId) {
  return jwt.sign({ postId, scope: ACTION_SCOPE }, process.env.JWT_SECRET, {
    expiresIn: '14d',
  });
}

/**
 * Verify a post-action token and return its payload ({ postId }). Throws if the
 * token is invalid, expired, or not an action-scoped token.
 */
export function verifyActionToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.scope !== ACTION_SCOPE) {
    throw new Error('Not a post-action token');
  }
  return payload;
}
