import express from 'express';

import { repositoryRouter } from './routes/repository.js';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is online',
  });
});

app.use('/api/repositories', repositoryRouter);
