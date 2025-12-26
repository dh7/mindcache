
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
      expect(mc.get_value('$version')).toBe('3.3.2');
      expect(mc.get_value('$date')).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
      expect(mc.get_value('$time')).toMatch(/^\d{2}:\d{2}:\d{2}$/); // HH:MM:SS

      // Should be read-only
      mc.set_value('$version', '9.9.9');
      expect(mc.get_value('$version')).toBe('3.3.2');
    });

    it('should get attributes for keys', () => {
      const mc = new MindCache();
      mc.set_value('attr-key', 'val', { systemTags: [], zIndex: 10 });
      const attrs = mc.get_attributes('attr-key');
      expect(attrs?.systemTags).not.toContain('LLMWrite');
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

  describe('Document Type', () => {
    it('should create a document with set_document', () => {
      const mc = new MindCache();
      mc.set_document('notes', 'Hello World');

      expect(mc.get_value('notes')).toBe('Hello World');
      expect(mc.get_attributes('notes')?.type).toBe('document');
    });

    it('should create a document with set_value and type: document', () => {
      const mc = new MindCache();
      mc.set_value('notes', 'Hello World', { type: 'document' });

      expect(mc.get_value('notes')).toBe('Hello World');
      expect(mc.get_attributes('notes')?.type).toBe('document');
      expect(mc.get_document('notes')).toBeDefined();
    });

    it('set_value on document key should use diff-based replace', () => {
      vi.useFakeTimers();
      const mc = new MindCache();
      mc.set_document('doc', 'Hello World');
      vi.advanceTimersByTime(600);

      // Using set_value on a document should route to replace_document_text
      mc.set_value('doc', 'Hello Beautiful World');
      expect(mc.get_value('doc')).toBe('Hello Beautiful World');

      // Y.Text should still exist (not replaced with string)
      expect(mc.get_document('doc')).toBeDefined();

      // Undo should work (diff was applied)
      mc.undo('doc');
      expect(mc.get_value('doc')).toBe('Hello World');

      vi.useRealTimers();
    });

    it('should return Y.Text for document keys via get_document', () => {
      const mc = new MindCache();
      mc.set_document('doc');

      const yText = mc.get_document('doc');
      expect(yText).toBeDefined();
      expect(typeof yText?.insert).toBe('function'); // Y.Text has insert method
    });

    it('should return undefined for get_document on non-document keys', () => {
      const mc = new MindCache();
      mc.set_value('text-key', 'hello');

      expect(mc.get_document('text-key')).toBeUndefined();
    });

    it('should support insert_text and delete_text', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello');

      mc.insert_text('doc', 5, ' World');
      expect(mc.get_value('doc')).toBe('Hello World');

      mc.delete_text('doc', 5, 6);
      expect(mc.get_value('doc')).toBe('Hello');
    });

    it('set_value should replace document content', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Initial content');

      mc.set_value('doc', 'Replaced content');
      expect(mc.get_value('doc')).toBe('Replaced content');
    });

    it('set_value should use diff for small changes', () => {
      vi.useFakeTimers();
      const mc = new MindCache();
      mc.set_document('doc', 'Hello World');
      vi.advanceTimersByTime(600);

      // Small change - should use diff (insert "Beautiful ")
      mc.set_value('doc', 'Hello Beautiful World');
      expect(mc.get_value('doc')).toBe('Hello Beautiful World');

      // Undo should only undo the insertion, not delete everything
      mc.undo('doc');
      expect(mc.get_value('doc')).toBe('Hello World');

      vi.useRealTimers();
    });

    it('set_value should do full replace for major changes', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello World');

      // Complete rewrite (>80% change) - full replace
      mc.set_value('doc', 'Completely Different Text Here');
      expect(mc.get_value('doc')).toBe('Completely Different Text Here');
    });

    it('set_value handles various change sizes', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello');

      // Replace with different content
      mc.set_value('doc', 'Goodbye');
      expect(mc.get_value('doc')).toBe('Goodbye');

      // Replace again
      mc.set_value('doc', 'Hello Again');
      expect(mc.get_value('doc')).toBe('Hello Again');
    });

    it('get_value should return plain text for document keys', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Content');

      expect(mc.get_value('doc')).toBe('Content');
    });

    it('serialize should convert Y.Text to string', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Serialized');

      const serialized = mc.serialize();
      expect(serialized.doc.value).toBe('Serialized');
      expect(serialized.doc.attributes.type).toBe('document');
    });

    it('should support per-key undo for document edits', () => {
      vi.useFakeTimers();
      const mc = new MindCache();
      mc.set_document('doc', 'Initial');
      vi.advanceTimersByTime(600);

      mc.insert_text('doc', 7, ' Text');
      vi.advanceTimersByTime(600);

      expect(mc.get_value('doc')).toBe('Initial Text');

      mc.undo('doc');
      expect(mc.get_value('doc')).toBe('Initial');

      mc.redo('doc');
      expect(mc.get_value('doc')).toBe('Initial Text');

      vi.useRealTimers();
    });

    it('should support global undo for document edits', () => {
      vi.useFakeTimers();
      const mc = new MindCache();

      mc.set_value('regular-key', 'regular value');
      mc.set_document('doc', 'Document content');
      vi.advanceTimersByTime(600);

      expect(mc.get_value('regular-key')).toBe('regular value');
      expect(mc.get_value('doc')).toBe('Document content');

      // Global undo should revert both
      mc.undoAll();
      expect(mc.get_value('regular-key')).toBeUndefined();
      expect(mc.get_value('doc')).toBeUndefined();

      // Global redo should restore both
      mc.redoAll();
      expect(mc.get_value('regular-key')).toBe('regular value');
      expect(mc.get_value('doc')).toBe('Document content');

      vi.useRealTimers();
    });

    it('should track document changes in history when history enabled', () => {
      const mc = new MindCache({
        indexedDB: { dbName: 'doc-history-test' }
      });

      expect(mc.historyEnabled).toBe(true);

      mc.set_document('doc', 'First');
      mc.insert_text('doc', 5, ' edit');

      const history = mc.getGlobalHistory();
      expect(history.length).toBeGreaterThan(0);
      // History should include the doc key
      const docEntries = history.filter(h => h.keysAffected?.includes('doc'));
      expect(docEntries.length).toBeGreaterThan(0);
    });
  });

  describe('LLM Tools', () => {
    it('should generate write_ tools for writable keys', () => {
      const mc = new MindCache();
      mc.set_value('writable', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      mc.set_value('readonly', 'value', { systemTags: ['SystemPrompt'] }); // No LLMWrite

      const tools = mc.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).toContain('write_writable');
      expect(toolNames).not.toContain('write_readonly');
    });

    it('should not generate tools for system keys', () => {
      const mc = new MindCache();
      const tools = mc.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).not.toContain('write_$date');
      expect(toolNames).not.toContain('write_$time');
    });

    it('should sanitize key names for tool names', () => {
      const mc = new MindCache();
      mc.set_value('my-special@key!', 'value', { systemTags: ['LLMWrite'] });

      const tools = mc.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_my-special_key_');
    });

    it('write_ tool should execute correctly', async () => {
      const mc = new MindCache();
      mc.set_value('test', 'old_value', { systemTags: ['LLMWrite'] });

      const tools = mc.get_aisdk_tools();
      const result = await tools['write_test'].execute({ value: 'new_value' });

      expect(result.result).toContain('Successfully wrote');
      expect(mc.get_value('test')).toBe('new_value');
    });

    it('should generate additional tools for document keys', () => {
      const mc = new MindCache();
      mc.set_document('doc', 'content');

      const tools = mc.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).toContain('write_doc');
      expect(toolNames).toContain('append_doc');
      expect(toolNames).toContain('insert_doc');
      expect(toolNames).toContain('edit_doc');
    });

    it('append_ tool should add text to end of document', async () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello');

      const tools = mc.get_aisdk_tools();
      await tools['append_doc'].execute({ text: ' World' });

      expect(mc.get_value('doc')).toBe('Hello World');
    });

    it('insert_ tool should insert text at position', async () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello World');

      const tools = mc.get_aisdk_tools();
      await tools['insert_doc'].execute({ index: 5, text: ' Beautiful' });

      expect(mc.get_value('doc')).toBe('Hello Beautiful World');
    });

    it('edit_ tool should find and replace text', async () => {
      const mc = new MindCache();
      mc.set_document('doc', 'Hello World');

      const tools = mc.get_aisdk_tools();
      await tools['edit_doc'].execute({ find: 'World', replace: 'Universe' });

      expect(mc.get_value('doc')).toBe('Hello Universe');
    });

    it('executeToolCall should work with sanitized tool names', () => {
      const mc = new MindCache();
      mc.set_value('my-special@key!', 'original', { systemTags: ['LLMWrite'] });

      const result = mc.executeToolCall('write_my-special_key_', 'new_value');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('my-special@key!');
      expect(mc.get_value('my-special@key!')).toBe('new_value');
    });

    it('executeToolCall should return null for invalid tool names', () => {
      const mc = new MindCache();
      expect(mc.executeToolCall('invalid_tool', 'value')).toBeNull();
      expect(mc.executeToolCall('write_nonexistent', 'value')).toBeNull();
    });

    it('get_system_prompt should include tool hints for writable keys', () => {
      const mc = new MindCache();
      mc.set_value('writable', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const prompt = mc.get_system_prompt();

      expect(prompt).toContain('writable: value');
      expect(prompt).toContain('write_writable tool');
    });

    it('get_system_prompt should include document tool hints for document keys', () => {
      const mc = new MindCache();
      mc.set_document('notes', 'content', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const prompt = mc.get_system_prompt();

      expect(prompt).toContain('notes: content');
      expect(prompt).toContain('write_notes');
      expect(prompt).toContain('append_notes');
      expect(prompt).toContain('edit_notes');
    });
  });
});
