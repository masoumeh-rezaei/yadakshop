import { createServer } from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { initializeRealtime } from './realtime.js';

const httpServer = createServer(app);
initializeRealtime(httpServer);

httpServer.listen(env.port, () => {
  console.log(`Delivery API is running on port ${env.port}`);
});
