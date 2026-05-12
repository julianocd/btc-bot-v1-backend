import { Router } from 'express';
import { env } from '../config/env.js';
import { binanceRest } from '../services/binance-rest.service.js';

const router = Router();
router.post('/test-order', async (req, res) => {
  try {
    const quantity = req.body?.quantity || '0.001';
    const side = req.body?.side || 'BUY';
    const result = await binanceRest.orderTest({ symbol: env.binanceSymbol, side, type: 'MARKET', quantity, recvWindow: 5000 });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export default router;
