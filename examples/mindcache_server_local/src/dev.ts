import { API_BASE_URL, CLIENT_HOST, CLIENT_PORT, DATA_DIR } from './config.ts';
import { startClientServer } from './clientServer.ts';
import { seedExampleFiles } from './seed.ts';
import { startMindCacheRuntime } from './serverRuntime.ts';

async function main(): Promise<void> {
  await seedExampleFiles();

  const runtime = await startMindCacheRuntime();
  const clientServer = await startClientServer(CLIENT_HOST, CLIENT_PORT);

  // eslint-disable-next-line no-console
  console.log(`[example] Seeded files in ${DATA_DIR}`);
  // eslint-disable-next-line no-console
  console.log(`[example] API: ${API_BASE_URL}`);
  // eslint-disable-next-line no-console
  console.log(`[example] Client: http://${CLIENT_HOST}:${CLIENT_PORT}`);

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      clientServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await runtime.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[example] Dev launcher failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
