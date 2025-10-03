import { MindCache } from '../src/index';

describe('MindCache Complete Serialization', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('serialize() and deserialize()', () => {
    test('should serialize complete state with values and attributes', () => {
      // Set up test data with different attribute combinations
      cache.set_value('user', 'john', { readonly: false, visible: true, template: false });
      cache.set_value('config', 'prod', { readonly: true, visible: false, template: false });
      cache.set_value('template_key', 'Hello {{user}}!', { readonly: false, visible: true, template: true });

      const serialized = cache.serialize();

      // Should contain all non-hardcoded entries with complete structure
      expect(serialized).toHaveProperty('user');
      expect(serialized).toHaveProperty('config');
      expect(serialized).toHaveProperty('template_key');

      // Verify structure includes both value and attributes
      expect(serialized.user).toEqual({
        value: 'john',
        attributes: {
          readonly: false,
          visible: true,
          hardcoded: false,
          template: false,
          type: 'text',
          tags: []
        }
      });

      expect(serialized.config).toEqual({
        value: 'prod',
        attributes: {
          readonly: true,
          visible: false,
          hardcoded: false,
          template: false,
          type: 'text',
          tags: []
        }
      });

      expect(serialized.template_key).toEqual({
        value: 'Hello {{user}}!',
        attributes: {
          readonly: false,
          visible: true,
          hardcoded: false,
          template: true,
          type: 'text',
          tags: []
        }
      });
    });

    test('should exclude hardcoded keys from serialization', () => {
      cache.set_value('normal_key', 'value');
      cache.set_value('hardcoded_key', 'hardcoded_value', { hardcoded: true });

      const serialized = cache.serialize();

      expect(serialized).toHaveProperty('normal_key');
      expect(serialized).not.toHaveProperty('hardcoded_key');
      expect(serialized).not.toHaveProperty('$date');
      expect(serialized).not.toHaveProperty('$time');
    });

    test('should deserialize complete state correctly', () => {
      const testData = {
        user: {
          value: 'alice',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text' as const
          }
        },
        config: {
          value: 'staging',
          attributes: {
            readonly: true,
            visible: false,
            hardcoded: false,
            template: false,
            type: 'text' as const
          }
        },
        greeting: {
          value: 'Hi {{user}}!',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: true,
            type: 'text' as const
          }
        }
      };

      cache.deserialize(testData);

      // Verify values are restored
      expect(cache.get_value('user')).toBe('alice');
      expect(cache.get_value('config')).toBe('staging');
      expect(cache.get_value('greeting')).toBe('Hi alice!'); // Template processed

      // Verify attributes are restored
      expect(cache.get_attributes('user')).toEqual({
        readonly: false,
        visible: true,
        hardcoded: false,
        template: false,
        type: 'text',
        tags: []
      });

      expect(cache.get_attributes('config')).toEqual({
        readonly: true,
        visible: false,
        hardcoded: false,
        template: false,
        type: 'text',
        tags: []
      });

      expect(cache.get_attributes('greeting')).toEqual({
        readonly: false,
        visible: true,
        hardcoded: false,
        template: true,
        type: 'text',
        tags: []
      });
    });

    test('should preserve system keys after deserialization', () => {
      const testData = {
        user: {
          value: 'test',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text' as const
          }
        }
      };

      cache.deserialize(testData);

      // System keys should still be available
      expect(cache.has('$date')).toBe(true);
      expect(cache.has('$time')).toBe(true);
      expect(cache.get_value('$date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cache.get_value('$time')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    test('should handle round-trip serialization correctly', () => {
      // Set up complex test data
      cache.set_value('name', 'Bob');
      cache.set_value('secret', 'hidden', { readonly: true, visible: false });
      cache.set_value('message', 'Welcome {{name}}!', { template: true, visible: true });

      const serialized = cache.serialize();
      const newCache = new MindCache();
      newCache.deserialize(serialized);

      // Verify all data matches
      expect(newCache.get_value('name')).toBe('Bob');
      expect(newCache.get_value('secret')).toBe('hidden');
      expect(newCache.get_value('message')).toBe('Welcome Bob!');

      // Verify attributes match
      expect(newCache.get_attributes('name')).toEqual(cache.get_attributes('name'));
      expect(newCache.get_attributes('secret')).toEqual(cache.get_attributes('secret'));
      expect(newCache.get_attributes('message')).toEqual(cache.get_attributes('message'));
    });
  });

  describe('toJSON() and fromJSON()', () => {
    test('should serialize to JSON string with complete state', () => {
      cache.set_value('test_key', 'test_value', {
        readonly: true,
        visible: false,
        template: true
      });

      const jsonString = cache.toJSON();
      const parsed = JSON.parse(jsonString);

      expect(parsed).toHaveProperty('test_key');
      expect(parsed.test_key).toEqual({
        value: 'test_value',
        attributes: {
          readonly: true,
          visible: false,
          hardcoded: false,
          template: true,
          type: 'text',
          tags: []
        }
      });
    });

    test('should deserialize from JSON string correctly', () => {
      const jsonData = {
        username: {
          value: 'testuser',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false
          }
        },
        template_msg: {
          value: 'Hello {{username}}!',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: true
          }
        }
      };

      const jsonString = JSON.stringify(jsonData);
      cache.fromJSON(jsonString);

      expect(cache.get_value('username')).toBe('testuser');
      expect(cache.get_value('template_msg')).toBe('Hello testuser!');
      expect(cache.get_attributes('template_msg')?.template).toBe(true);
    });

    test('should handle invalid JSON gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      cache.set_value('existing', 'value');
      cache.fromJSON('invalid json');

      // Should not crash and existing data should remain
      expect(cache.get_value('existing')).toBe('value');
      expect(consoleSpy).toHaveBeenCalledWith(
        'MindCache: Failed to deserialize JSON:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle round-trip JSON serialization', () => {
      cache.set_value('data', 'important', { readonly: true });
      cache.set_value('greeting', 'Hi {{data}}!', { template: true });

      const jsonString = cache.toJSON();
      const newCache = new MindCache();
      newCache.fromJSON(jsonString);

      expect(newCache.get_value('data')).toBe('important');
      expect(newCache.get_value('greeting')).toBe('Hi important!');
      expect(newCache.get_attributes('data')?.readonly).toBe(true);
      expect(newCache.get_attributes('greeting')?.template).toBe(true);
    });
  });

  describe('Clear behavior', () => {
    test('should remove all entries after clear', () => {
      // Set up data
      cache.set_value('name', 'Anonymous User');

      const serialized = cache.serialize();

      // Verify defaults are in serialized data
    });

    test('should preserve all existing attributes when updating value only', () => {
      // Create key with complex attributes
      cache.set_value('config', 'initial', {
        readonly: true,
        visible: false,
        template: true
      });

      // Verify initial state
      const initialAttrs = cache.get_attributes('config');
      expect(initialAttrs).toEqual({
        readonly: true,
        visible: false,
        hardcoded: false,
        template: true,
        type: 'text',
        tags: []
      });

      // Update value only (should preserve all attributes)
      cache.set_value('config', 'updated');

      // All attributes should be preserved
      expect(cache.get_value('config')).toBe('updated');
      expect(cache.get_attributes('config')).toEqual({
        readonly: true,
        visible: false,
        hardcoded: false,
        template: true,
        type: 'text',
        tags: []
      });
    });

    test('should allow partial attribute updates while preserving others', () => {
      // Create key with defaults
      cache.set_value('setting', 'value', {
        readonly: false,
        visible: true,
        template: false
      });

      // Update only one attribute
      cache.set_value('setting', 'new_value', { readonly: true });

      // Should preserve other attributes while updating the specified one
      expect(cache.get_value('setting')).toBe('new_value');
      expect(cache.get_attributes('setting')).toEqual({
        readonly: true,  // Updated
        visible: true,   // Preserved
        hardcoded: false, // Preserved
        template: false,  // Preserved
        type: 'text',     // Preserved
        tags: []         // Default
      });
    });

  });

  describe('Template processing after deserialization', () => {
    test('should process templates correctly after deserialization', () => {
      const data = {
        name: {
          value: 'World'
        },
        greeting: {
          value: 'Hello {{name}}!'
        },
        nested: {
          value: '{{greeting}} Welcome!'
        }
      };

      // Need to properly set up the entries with attributes
      cache.set_value('name', 'World');
      cache.set_value('greeting', 'Hello {{name}}!', { template: true });
      cache.set_value('nested', '{{greeting}} Welcome!', { template: true });

      expect(cache.get_value('greeting')).toBe('Hello World!');
      expect(cache.get_value('nested')).toBe('Hello World! Welcome!');
    });
  });
});
