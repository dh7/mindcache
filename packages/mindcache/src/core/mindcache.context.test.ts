import { describe, test, expect, beforeEach } from 'vitest';
import { MindCache } from './MindCache';

describe('MindCache Context Filtering', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  // ============================================
  // Context Setup and Basic API
  // ============================================

  describe('set_context / get_context / reset_context', () => {
    test('should have no context by default', () => {
      expect(cache.hasContext).toBe(false);
      expect(cache.get_context()).toBeNull();
    });

    test('should set context with array of tags', () => {
      cache.set_context(['project-a']);

      expect(cache.hasContext).toBe(true);
      expect(cache.get_context()).toEqual({ tags: ['project-a'] });
    });

    test('should set context with ContextRules object', () => {
      cache.set_context({
        tags: ['project-a', 'v2'],
        defaultContentTags: ['project-a'],
        defaultSystemTags: ['SystemPrompt', 'LLMWrite']
      });

      expect(cache.hasContext).toBe(true);
      const context = cache.get_context();
      expect(context?.tags).toEqual(['project-a', 'v2']);
      expect(context?.defaultContentTags).toEqual(['project-a']);
      expect(context?.defaultSystemTags).toEqual(['SystemPrompt', 'LLMWrite']);
    });

    test('should reset context', () => {
      cache.set_context(['project-a']);
      expect(cache.hasContext).toBe(true);

      cache.reset_context();
      expect(cache.hasContext).toBe(false);
      expect(cache.get_context()).toBeNull();
    });

    test('should set context at construction time', () => {
      const contextCache = new MindCache({
        context: { tags: ['initial-tag'] }
      });

      expect(contextCache.hasContext).toBe(true);
      expect(contextCache.get_context()?.tags).toEqual(['initial-tag']);
    });
  });

  // ============================================
  // Context Filtering - Read Operations
  // ============================================

  describe('Context filtering - keys() and has()', () => {
    beforeEach(() => {
      // Setup test data with different tags
      cache.set_value('key-a1', 'value-a1');
      cache.addTag('key-a1', 'project-a');

      cache.set_value('key-a2', 'value-a2');
      cache.addTag('key-a2', 'project-a');

      cache.set_value('key-b1', 'value-b1');
      cache.addTag('key-b1', 'project-b');

      cache.set_value('key-both', 'value-both');
      cache.addTag('key-both', 'project-a');
      cache.addTag('key-both', 'project-b');

      cache.set_value('key-none', 'value-none');
    });

    test('should return all keys without context', () => {
      const keys = cache.keys();
      expect(keys).toContain('key-a1');
      expect(keys).toContain('key-a2');
      expect(keys).toContain('key-b1');
      expect(keys).toContain('key-both');
      expect(keys).toContain('key-none');
    });

    test('should filter keys by single tag context', () => {
      cache.set_context(['project-a']);

      const keys = cache.keys();
      expect(keys).toContain('key-a1');
      expect(keys).toContain('key-a2');
      expect(keys).toContain('key-both'); // Has project-a too
      expect(keys).not.toContain('key-b1');
      expect(keys).not.toContain('key-none');
    });

    test('should filter keys with AND logic (multiple tags)', () => {
      cache.set_context(['project-a', 'project-b']);

      const keys = cache.keys();
      expect(keys).toContain('key-both'); // Has both tags
      expect(keys).not.toContain('key-a1'); // Only has project-a
      expect(keys).not.toContain('key-b1'); // Only has project-b
      expect(keys).not.toContain('key-none');
    });

    test('has() should respect context', () => {
      expect(cache.has('key-a1')).toBe(true);
      expect(cache.has('key-b1')).toBe(true);

      cache.set_context(['project-a']);

      expect(cache.has('key-a1')).toBe(true);
      expect(cache.has('key-b1')).toBe(false); // Filtered out
    });

    test('size() should count only matching keys', () => {
      const fullSize = cache.size();
      expect(fullSize).toBe(5); // 5 keys

      cache.set_context(['project-a']);
      expect(cache.size()).toBe(3); // 3 matching keys
    });
  });

  describe('Context filtering - get_value()', () => {
    beforeEach(() => {
      cache.set_value('visible-key', 'visible-value');
      cache.addTag('visible-key', 'allowed');

      cache.set_value('hidden-key', 'hidden-value');
      cache.addTag('hidden-key', 'blocked');
    });

    test('should return value for matching key', () => {
      cache.set_context(['allowed']);
      expect(cache.get_value('visible-key')).toBe('visible-value');
    });

    test('should return undefined for non-matching key', () => {
      cache.set_context(['allowed']);
      expect(cache.get_value('hidden-key')).toBeUndefined();
    });

    test('$date/$time/$version only work in templates', () => {
      cache.set_context(['allowed']);
      // They are not real keys, so get_value returns undefined
      expect(cache.get_value('$date')).toBeUndefined();
      expect(cache.get_value('$time')).toBeUndefined();

      // But they work in templates
      cache.set_value('template', 'Date: {{$date}}', { systemTags: ['ApplyTemplate'] });
      cache.addTag('template', 'allowed');
      expect(cache.get_value('template')).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Context filtering - getAll() and getAllEntries()', () => {
    beforeEach(() => {
      cache.set_value('key-a', 'value-a');
      cache.addTag('key-a', 'group-x');

      cache.set_value('key-b', 'value-b');
      cache.addTag('key-b', 'group-y');
    });

    test('getAll() should respect context', () => {
      cache.set_context(['group-x']);

      const all = cache.getAll();
      expect(all['key-a']).toBe('value-a');
      expect(all['key-b']).toBeUndefined();
    });

    test('getAllEntries() should respect context', () => {
      cache.set_context(['group-x']);

      const entries = cache.getAllEntries();
      expect(entries['key-a']).toBeDefined();
      expect(entries['key-a'].value).toBe('value-a');
      expect(entries['key-b']).toBeUndefined();
    });
  });

  describe('Context filtering - values() and entries()', () => {
    beforeEach(() => {
      cache.set_value('key-x', 'value-x');
      cache.addTag('key-x', 'tag-x');

      cache.set_value('key-y', 'value-y');
      cache.addTag('key-y', 'tag-y');
    });

    test('values() should respect context', () => {
      cache.set_context(['tag-x']);

      const values = cache.values();
      expect(values).toContain('value-x');
      expect(values).not.toContain('value-y');
    });

    test('entries() should respect context', () => {
      cache.set_context(['tag-x']);

      const entries = cache.entries();
      const keyNames = entries.map(([k]) => k);
      expect(keyNames).toContain('key-x');
      expect(keyNames).not.toContain('key-y');
    });
  });

  // ============================================
  // Context Filtering - Write Operations
  // ============================================

  describe('Context filtering - set_value()', () => {
    beforeEach(() => {
      cache.set_value('matching-key', 'old-value');
      cache.addTag('matching-key', 'allowed');

      cache.set_value('non-matching-key', 'old-value');
      cache.addTag('non-matching-key', 'blocked');
    });

    test('should allow set_value on matching key', () => {
      cache.set_context(['allowed']);

      cache.set_value('matching-key', 'new-value');
      expect(cache.get_value('matching-key')).toBe('new-value');
    });

    test('should throw error when modifying non-matching key', () => {
      cache.set_context(['allowed']);

      expect(() => {
        cache.set_value('non-matching-key', 'new-value');
      }).toThrow('does not match current context');
    });

    test('should use create_key for new keys in context mode', () => {
      cache.set_context({
        tags: ['new-tag'],
        defaultContentTags: ['new-tag', 'auto-added'],
        defaultSystemTags: ['LLMRead']
      });

      // New key should get default tags from context
      cache.set_value('brand-new-key', 'brand-new-value');

      // Reset context to see the key
      cache.reset_context();

      expect(cache.get_value('brand-new-key')).toBe('brand-new-value');
      expect(cache.getTags('brand-new-key')).toContain('new-tag');
      expect(cache.getTags('brand-new-key')).toContain('auto-added');
    });
  });

  describe('Context filtering - set_attributes()', () => {
    beforeEach(() => {
      cache.set_value('matching-key', 'value');
      cache.addTag('matching-key', 'allowed');

      cache.set_value('non-matching-key', 'value');
      cache.addTag('non-matching-key', 'blocked');
    });

    test('should allow set_attributes on matching key', () => {
      cache.set_context(['allowed']);

      cache.set_attributes('matching-key', { zIndex: 10 });
      cache.reset_context();

      expect(cache.get_attributes('matching-key')?.zIndex).toBe(10);
    });

    test('should throw error when modifying attributes of non-matching key', () => {
      cache.set_context(['allowed']);

      expect(() => {
        cache.set_attributes('non-matching-key', { zIndex: 10 });
      }).toThrow('does not match current context');
    });
  });

  // ============================================
  // create_key with context defaults
  // ============================================

  describe('create_key()', () => {
    test('should create key with default tags from context', () => {
      cache.set_context({
        tags: ['project-x'],
        defaultContentTags: ['project-x', 'created-via-context'],
        defaultSystemTags: ['SystemPrompt', 'LLMWrite']
      });

      cache.create_key('new-key', 'new-value');

      // Reset context to verify
      cache.reset_context();

      expect(cache.get_value('new-key')).toBe('new-value');
      expect(cache.getTags('new-key')).toContain('project-x');
      expect(cache.getTags('new-key')).toContain('created-via-context');
    });

    test('should merge provided attributes with context defaults', () => {
      cache.set_context({
        tags: ['project-x'],
        defaultContentTags: ['project-x']
      });

      cache.create_key('new-key', 'value', {
        contentTags: ['explicit-tag'],
        zIndex: 5
      });

      cache.reset_context();

      const tags = cache.getTags('new-key');
      expect(tags).toContain('project-x');
      expect(tags).toContain('explicit-tag');
      expect(cache.get_attributes('new-key')?.zIndex).toBe(5);
    });

    test('should throw error if key already exists', () => {
      cache.set_value('existing', 'value');

      expect(() => {
        cache.create_key('existing', 'new-value');
      }).toThrow('Key already exists');
    });

    test('should allow creating keys with $ prefix if not reserved', () => {
      // $date, $time, $version are now only template variables
      // Users could create keys like $custom if they wanted
      cache.create_key('$custom', 'value');
      expect(cache.get_value('$custom')).toBe('value');
    });
  });

  // ============================================
  // Context with exports and LLM methods
  // ============================================

  describe('Context filtering - toMarkdown()', () => {
    beforeEach(() => {
      cache.set_value('exported', 'exported-value');
      cache.addTag('exported', 'export-tag');

      cache.set_value('not-exported', 'hidden-value');
      cache.addTag('not-exported', 'other-tag');
    });

    test('should export only matching keys', () => {
      cache.set_context(['export-tag']);

      const md = cache.toMarkdown();
      expect(md).toContain('### exported');
      expect(md).not.toContain('### not-exported');
    });
  });

  describe('Context filtering - get_system_prompt()', () => {
    beforeEach(() => {
      cache.set_value('visible-to-llm', 'llm-value', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      cache.addTag('visible-to-llm', 'llm-context');

      cache.set_value('hidden-from-llm', 'hidden-value', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      cache.addTag('hidden-from-llm', 'other-context');
    });

    test('should include only context-matching keys in system prompt', () => {
      cache.set_context(['llm-context']);

      const prompt = cache.get_system_prompt();
      expect(prompt).toContain('visible-to-llm');
      expect(prompt).not.toContain('hidden-from-llm');
    });
  });

  describe('Context filtering - create_vercel_ai_tools()', () => {
    beforeEach(() => {
      cache.set_value('tool-enabled', 'value', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      cache.addTag('tool-enabled', 'tool-context');

      cache.set_value('tool-disabled', 'value', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      cache.addTag('tool-disabled', 'other-context');
    });

    test('should generate tools only for context-matching keys', () => {
      cache.set_context(['tool-context']);

      const tools = cache.create_vercel_ai_tools();
      expect(tools['write_tool-enabled']).toBeDefined();
      expect(tools['write_tool-disabled']).toBeUndefined();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge cases', () => {
    test('should handle empty tags array (no filtering)', () => {
      cache.set_value('key1', 'value1');
      cache.set_value('key2', 'value2');

      cache.set_context([]);

      // Empty tags = all keys match
      expect(cache.keys()).toContain('key1');
      expect(cache.keys()).toContain('key2');
    });

    test('should allow context change mid-operation', () => {
      cache.set_value('key-a', 'value-a');
      cache.addTag('key-a', 'tag-a');

      cache.set_value('key-b', 'value-b');
      cache.addTag('key-b', 'tag-b');

      cache.set_context(['tag-a']);
      expect(cache.keys()).toContain('key-a');
      expect(cache.keys()).not.toContain('key-b');

      cache.set_context(['tag-b']);
      expect(cache.keys()).not.toContain('key-a');
      expect(cache.keys()).toContain('key-b');
    });
  });
});
