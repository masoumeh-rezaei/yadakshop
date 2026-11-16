import { createServer } from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { initializeRealtime } from './realtime.js';
import { startPushWorker } from './services/push.service.js';

const httpServer = createServer(app);
initializeRealtime(httpServer);
if (process.env.PEIK_DISABLE_BACKGROUND_WORKERS !== '1') startPushWorker();

httpServer.listen(env.port, () => {
  console.log(`Delivery API is running on port ${env.port}`);
});
