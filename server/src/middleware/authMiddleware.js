import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return req.query?.token ?? null;
}

/**
 * Require valid JWT in Authorization: Bearer <token> or query.token (e.g. for invoice PDF link).
 * Sets req.user = { id, username } and calls next(); otherwise 401.
 */
export function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ data: null, error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ data: null, error: 'Invalid or expired token' });
  }
}
