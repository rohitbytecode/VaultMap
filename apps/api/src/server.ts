import { app } from './app.js';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  console.log(`vaultMap API running on port ${port}`);
});
