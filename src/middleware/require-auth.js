import { env } from '../config/env.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[env.cookieName];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
