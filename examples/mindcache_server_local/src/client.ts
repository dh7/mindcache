import { CLIENT_HOST, CLIENT_PORT } from './config.ts';
import { startClientServer } from './clientServer.ts';

async function main(): Promise<void> {
  const server = await startClientServer(CLIENT_HOST, CLIENT_PORT);

  // eslint-disable-next-line no-console
  console.log(`[example] Client running at http://${CLIENT_HOST}:${CLIENT_PORT}`);

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
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
  console.error(`[example] Client failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
