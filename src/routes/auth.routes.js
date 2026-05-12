import { Router } from 'express';
import { env } from '../config/env.js';
import { isValidLogin, signSession } from '../services/auth.service.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidLogin(email, password)) return res.status(401).json({ error: 'Invalid credentials' });
  res.cookie(env.cookieName, signSession({ email }), { httpOnly: true, sameSite: 'lax', secure: false });
  res.json({ ok: true, email });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(env.cookieName);
  res.json({ ok: true });
});

export default router;
