import crypto from 'crypto';
import { env } from '../config/env.js';

export function signQuery(queryString) {
  return crypto.createHmac('sha256', env.binanceApiSecret).update(queryString).digest('hex');
}
