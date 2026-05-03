import express from 'express';
import cors from 'cors';
import { env } from './lib/env.js';
import { chatRouter } from './routes/chat.js';

const app = express();

app.use(
  cors({
    // TODO: replace in Prompt B — restrict to the production extension ID.
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/chat', chatRouter);

app.listen(env.PORT, () => {
  console.log(`[backend] listening on http://localhost:${env.PORT}`);
});
