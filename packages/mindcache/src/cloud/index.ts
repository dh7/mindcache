import { MindCache } from '../core/MindCache';
import { CloudAdapter } from './CloudAdapter';
import type { CloudConfig } from './types';

export { CloudAdapter } from './CloudAdapter';
export type {
  CloudConfig,
  ConnectionState,
  CloudAdapterEvents,
  Operation,
  SetOperation,
  DeleteOperation,
  ClearOperation
} from './types';

/**
 * Connect a MindCache instance to the cloud for real-time sync.
 *
 * @example
 * ```typescript
 * import { MindCache } from 'mindcache';
 * import { connectCloud } from 'mindcache/cloud';
 *
 * const mc = new MindCache();
 * const adapter = connectCloud(mc, {
 *   projectId: 'my-project',
 *   instanceId: 'main',
 *   apiKey: 'mc_live_xxxxx'
 * });
 *
 * // Now mc is synced with the cloud!
 * mc.set_value('name', 'Alice');
 * ```
 */
export function connectCloud(mc: MindCache, config: CloudConfig): CloudAdapter {
  const adapter = new CloudAdapter(config);
  adapter.attach(mc);
  adapter.connect();
  return adapter;
}

/**
 * Create a new MindCache instance that's already connected to the cloud.
 *
 * @example
 * ```typescript
 * import { createCloudMindCache } from 'mindcache/cloud';
 *
 * const mc = createCloudMindCache({
 *   projectId: 'my-project',
 *   instanceId: 'main',
 *   apiKey: 'mc_live_xxxxx'
 * });
 *
 * // Ready to use with cloud sync!
 * mc.set_value('name', 'Alice');
 * ```
 */
export function createCloudMindCache(config: CloudConfig): MindCache & { adapter: CloudAdapter } {
  const mc = new MindCache();
  const adapter = connectCloud(mc, config);

  // Attach adapter to the instance for access
  return Object.assign(mc, { adapter });
}

