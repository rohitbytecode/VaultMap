import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { repositoryRouter } from './routes/repository.js';
import { fileRouter } from './routes/file.js';
import { githubRouter } from './routes/github.js';

export const app = express();

const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
const configuredOrigins = corsOriginEnv
  ? corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  if (!corsOriginEnv || corsOriginEnv === '*') return true;
  if (configuredOrigins.includes(originHeader)) return true;

  try {
    const parsed = new URL(originHeader);
    if (
      parsed.hostname === 'vaultmap.rohitdmore.in' ||
      parsed.hostname.endsWith('.rohitdmore.in')
    ) {
      return true;
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    if (parsed.hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch {
    // Malformed origin URL
  }

  return false;
}

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      if (isAllowedOrigin(requestOrigin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is online',
  });
});

app.use('/api/github', githubRouter);
app.use('/api/repositories', repositoryRouter);
app.use('/api/repositories/file', fileRouter);
