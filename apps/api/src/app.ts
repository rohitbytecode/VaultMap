import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { repositoryRouter } from './routes/repository.js';
import { fileRouter } from './routes/file.js';
import { githubRouter } from './routes/github.js';

export const app = express();

const corsOrigin = process.env.CORS_ORIGIN?.trim();
const origin = corsOrigin
  ? corsOrigin === '*'
    ? true
    : corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin
  : true;

app.use(
  cors({
    origin,
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
