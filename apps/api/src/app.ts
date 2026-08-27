import express from 'express';
import cors from 'cors';

import { repositoryRouter } from './routes/repository.js';
import { fileRouter } from './routes/file.js';

export const app = express();

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is online',
  });
});

app.use('/api/repositories', repositoryRouter);
app.use('/api/repositories/file', fileRouter);
