
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MindCache } from './MindCache';

// Mock CloudAdapter
const mockListeners: Record<string, Function[]> = {};

const mockCloudAdapter = {
  attach: vi.fn(),
  detach: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setTokenProvider: vi.fn(),
  state: 'disconnected',
  on(event: string, listener: Function) {
    if (!mockListeners[event]) {
      mockListeners[event] = [];
    }
    mockListeners[event].push(listener);
  },
  off(event: string, listener: Function) {
    if (mockListeners[event]) {
      mockListeners[event] = mockListeners[event].filter(l => l !== listener);
    }
  },
  emit(event: string) {
    if (mockListeners[event]) {
      mockListeners[event].forEach(l => l());
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
    // Reset mocks
    Object.keys(mockListeners).forEach(key => delete mockListeners[key]);
    vi.clearAllMocks();
  });

  describe('Core Functionality', () => {
    it('should set and get values correctly', () => {
      const mc = new MindCache();
      mc.set_value('test-key', 'test-value');
      expect(mc.get_value('test-key')).toBe('test-value');
    });

    it('should handle reserved keys ($version, $date, $time)', () => {
      const mc = new MindCache();
      expect(mc.get_value('$version')).toBe('3.0.0');
      expect(mc.get_value('$date')).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
      expect(mc.get_value('$time')).toMatch(/^\d{2}:\d{2}:\d{2}$/); // HH:MM:SS

      // Should be read-only
      mc.set_value('$version', '9.9.9');
      expect(mc.get_value('$version')).toBe('3.0.0');
    });

    it('should get attributes for keys', () => {
      const mc = new MindCache();
      mc.set_value('attr-key', 'val', { readonly: true, zIndex: 10 });
      const attrs = mc.get_attributes('attr-key');
      expect(attrs?.readonly).toBe(true);
      expect(attrs?.zIndex).toBe(10);
    });
  });

  describe('Yjs & History', () => {
    it.skip('should support undo/redo', () => {

      vi.useFakeTimers();

      const mc = new MindCache();

      // First set creates the entry and is tracked
      mc.set_value('key', '1');
      vi.advanceTimersByTime(600); // Flush capture timeout

      // Update to '2'
      mc.set_value('key', '2');
      vi.advanceTimersByTime(600);

      expect(mc.get_value('key')).toBe('2');

      // Undo: '2' -> '1'
      mc.undo('key');
      expect(mc.get_value('key')).toBe('1');

      // Undo: '1' -> undefined (original state before any set_value)
      mc.undo('key');
      expect(mc.get_value('key')).toBeUndefined();

      // Redo: undefined -> '1'
      mc.redo('key');
      expect(mc.get_value('key')).toBe('1');

      // Redo: '1' -> '2'
      mc.redo('key');
      expect(mc.get_value('key')).toBe('2');

      vi.useRealTimers();
    });

    it('getHistory should return undo stack items', () => {
      vi.useFakeTimers();
      const mc = new MindCache();
      mc.set_value('stack-key', 'A');
      vi.advanceTimersByTime(600);

      mc.set_value('stack-key', 'B');
      vi.advanceTimersByTime(600);

      const history = mc.getHistory('stack-key');
      expect(history.length).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('undoAll should undo all recent changes across keys', () => {
      vi.useFakeTimers();
      const mc = new MindCache();

      // Make changes (all within capture timeout, so they batch together)
      mc.set_value('key1', 'a');
      mc.set_value('key2', 'b');
      vi.advanceTimersByTime(600); // Flush the capture timeout

      expect(mc.get_value('key1')).toBe('a');
      expect(mc.get_value('key2')).toBe('b');

      // Undo should revert all batched changes
      mc.undoAll();
      // After undo, both keys should be undefined (reverted to initial state)
      expect(mc.get_value('key1')).toBeUndefined();
      expect(mc.get_value('key2')).toBeUndefined();

      // Redo should restore both
      mc.redoAll();
      expect(mc.get_value('key1')).toBe('a');
      expect(mc.get_value('key2')).toBe('b');

      vi.useRealTimers();
    });

    it('canUndoAll and canRedoAll should reflect stack state', () => {
      vi.useFakeTimers();
      const mc = new MindCache();

      // Initially no undo/redo available (after initializing global undo manager)
      expect(mc.canUndoAll()).toBe(false);
      expect(mc.canRedoAll()).toBe(false);

      mc.set_value('test', 'value');
      vi.advanceTimersByTime(600);

      expect(mc.canUndoAll()).toBe(true);
      expect(mc.canRedoAll()).toBe(false);

      mc.undoAll();
      expect(mc.canUndoAll()).toBe(false);
      expect(mc.canRedoAll()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('History Tracking', () => {
    it('history should be disabled in memory-only mode', () => {
      const mc = new MindCache();
      expect(mc.historyEnabled).toBe(false);
      expect(mc.getGlobalHistory()).toEqual([]);
    });

    it('history should be enabled in offline mode', () => {
      // We can't fully test IndexedDB in unit tests without mocking
      // but we can verify the API exists
      const mc = new MindCache({
        indexedDB: { dbName: 'test-history-db' }
      });
      expect(mc.historyEnabled).toBe(true);
    });

    it('getGlobalHistory returns history entries with keys affected', () => {
      const mc = new MindCache({
        indexedDB: { dbName: 'test-history-db-2' }
      });

      mc.set_value('myKey', 'myValue');

      const history = mc.getGlobalHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('keysAffected');
      expect(history[0].keysAffected).toContain('myKey');
    });
  });

  describe('Cloud Integration', () => {
    it('waitForSync resolves immediately in local mode', async () => {
      const mc = new MindCache();
      expect(mc.isLoaded).toBe(true);

      const start = Date.now();
      await mc.waitForSync();
      expect(Date.now() - start).toBeLessThan(50);
    });

    it('waitForSync waits for synced event in cloud mode', async () => {
      vi.spyOn(MindCache.prototype as any, '_getCloudAdapterClass').mockResolvedValue(MockCloudAdapter);

      const mc = new MindCache({
        cloud: { instanceId: 'test' }
      });

      // Initially not loaded
      expect(mc.isLoaded).toBe(false);

      let resolved = false;
      const promise = mc.waitForSync().then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      // Wait for async init loop
      await new Promise(r => setTimeout(r, 10)); // Flush promises

      // Simulate sync event via mock
      if (mockListeners['synced']) {
        mockListeners['synced'].forEach(l => l());
      }

      await promise;
      expect(resolved).toBe(true);
      expect(mc.isLoaded).toBe(true);
    });
  });
});
