import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import marketRoutes from './routes/market.routes.js';
import tradeRoutes from './routes/trade.routes.js';
import { requireAuth } from './middleware/require-auth.js';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.appOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/', (_req, res) => res.json({ ok: true, service: 'btc-bot-v1-backend' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/market', marketRoutes);
app.use('/trade', requireAuth, tradeRoutes);

export default app;