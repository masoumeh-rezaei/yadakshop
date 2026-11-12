import { createServer } from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { initializeRealtime } from './realtime.js';
import { startPushWorker } from './services/push.service.js';

const httpServer = createServer(app);
initializeRealtime(httpServer);
startPushWorker();

httpServer.listen(env.port, () => {
  console.log(`Delivery API is running on port ${env.port}`);
});
