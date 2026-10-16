// -----------------------------------------------------------------------------
// Entry point of the Samsung SyncThru integration.
//
// Only the SDK wiring: the client reads GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN and GLADYS_INTEGRATION_SELECTOR from the
// environment set by the Gladys supervisor; every handler is registered by
// registerIntegration() (src/app.js) before connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerIntegration } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerIntegration(gladys);

// The SDK disconnects cleanly and exits 0 on SIGTERM/SIGINT.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}, shutting down`);
  app.stop();
});

logger.info('Starting the Samsung SyncThru integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
