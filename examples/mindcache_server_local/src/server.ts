import { API_BASE_URL, DATA_DIR } from './config.ts';
import { seedExampleFiles } from './seed.ts';
import { startMindCacheRuntime } from './serverRuntime.ts';

async function main(): Promise<void> {
  await seedExampleFiles();
  const runtime = await startMindCacheRuntime();

  // eslint-disable-next-line no-console
  console.log(`[example] MindCache API running at ${API_BASE_URL}`);
  // eslint-disable-next-line no-console
  console.log(`[example] Watching data folder: ${DATA_DIR}`);

  const shutdown = async () => {
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
  console.error(`[example] Server failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
