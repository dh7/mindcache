
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MindCache } from './MindCache';

// Mock CloudAdapter
const mockCloudAdapter = {
  listeners: {} as Record<string, Function[]>,
  attach: vi.fn(),
  detach: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setTokenProvider: vi.fn(),
  state: 'disconnected',
  on(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  },
  off(event: string, listener: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }
  },
  emit(event: string) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(l => l());
    }
  }
};

// Mock CloudAdapter class structure
class MockCloudAdapter {
  constructor() {
    return mockCloudAdapter;
  }
}

vi.mock('../cloud/CloudAdapter', () => ({
  CloudAdapter: class {
    constructor() {
      return mockCloudAdapter;
    }
  }
}));

describe('MindCache', () => {
  beforeEach(() => {
    mockCloudAdapter.listeners = {};
    vi.clearAllMocks();
  });

  it('waitForSync resolves immediately in local mode', async () => {
    const mc = new MindCache();
    // Default is local, so isLoaded is true
    expect(mc.isLoaded).toBe(true);

    const start = Date.now();
    await mc.waitForSync();
    expect(Date.now() - start).toBeLessThan(50); // Immediate
  });

  it('waitForSync waits for synced event in cloud mode', async () => {
    // Spy on the protected method to inject mock
    // We cast to any to access protected method
    vi.spyOn(MindCache.prototype as any, '_getCloudAdapterClass').mockResolvedValue(MockCloudAdapter);

    // Initialize with cloud config
    const mc = new MindCache({
      cloud: { instanceId: 'test' }
    });

    // _initPromise is already started in constructor!
    // BUT, _initCloud awaits _getCloudAdapterClass().
    // If we spy AFTER constructor, is it too late?

    // The constructor calls _initCloud immediately.
    // _initCloud calls await _getCloudAdapterClass().
    // If _getCloudAdapterClass is async (it is), it returns a promise.
    // The constructor continues.

    // So if we spy immediately after `new MindCache`, we might catch it if `_initCloud` hasn't reached that line yet?
    // No, strictly searching, `new MindCache` triggers everything synchronously until the first await.

    // `_initCloud` awaits `_getCloudAdapterClass()`.
    // Inside `_getCloudAdapterClass`, it awaits `import`.

    // If we spy on the PROTOTYPE, we can catch it!

    // Cloud mode starts unloaded
    // MindCache constructor is async in initialization logic (connect is called but not awaited)
    // But isLoaded should be set to false synchronously in constructor if cloud config is present
    expect(mc.isLoaded).toBe(false);

    let resolved = false;
    const promise = mc.waitForSync().then(() => {
      resolved = true;
    });

    // Should not handle immediately
    expect(resolved).toBe(false);

    // Wait for microtasks to flush so waitForSync creates the listener
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate sync event
    mockCloudAdapter.emit('synced');

    await promise;
    expect(resolved).toBe(true);
    expect(mc.isLoaded).toBe(true);
  });
});
