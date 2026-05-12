import crypto from 'crypto';
import { env } from '../config/env.js';

export function isValidLogin(email, password) {
  if (email !== env.userEmail) return false;
  if (!env.userPasswordHash) return password === 'change-me';
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return hash === env.userPasswordHash;
}

export function signSession(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
