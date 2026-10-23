import 'dotenv/config';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 5000);
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`vaultMap API running on port ${port}`);
});
