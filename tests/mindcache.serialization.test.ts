import { MindCache } from 'mindcache';

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

      // Verify structure includes both value and attributes with new tag system
      expect(serialized.user.value).toBe('john');
      expect(serialized.user.attributes.readonly).toBe(false);
      expect(serialized.user.attributes.visible).toBe(true);
      expect(serialized.user.attributes.contentTags).toEqual([]);
      expect(serialized.user.attributes.systemTags).toContain('prompt');

      expect(serialized.config.value).toBe('prod');
      expect(serialized.config.attributes.readonly).toBe(true);
      expect(serialized.config.attributes.visible).toBe(false);
      expect(serialized.config.attributes.systemTags).toContain('readonly');
      expect(serialized.config.attributes.systemTags).not.toContain('prompt');

      expect(serialized.template_key.value).toBe('Hello {{user}}!');
      expect(serialized.template_key.attributes.template).toBe(true);
      expect(serialized.template_key.attributes.systemTags).toContain('template');
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
            type: 'text' as const,
            contentTags: [],
            systemTags: ['prompt'] as ('prompt' | 'readonly' | 'protected' | 'template')[],
            tags: [],
            zIndex: 0
          }
        },
        config: {
          value: 'staging',
          attributes: {
            readonly: true,
            visible: false,
            hardcoded: false,
            template: false,
            type: 'text' as const,
            contentTags: [],
            systemTags: ['readonly'] as ('prompt' | 'readonly' | 'protected' | 'template')[],
            tags: [],
            zIndex: 0
          }
        },
        greeting: {
          value: 'Hi {{user}}!',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: true,
            type: 'text' as const,
            contentTags: [],
            systemTags: ['prompt', 'template'] as ('prompt' | 'readonly' | 'protected' | 'template')[],
            tags: [],
            zIndex: 0
          }
        }
      };

      cache.deserialize(testData);

      // Verify values are restored
      expect(cache.get_value('user')).toBe('alice');
      expect(cache.get_value('config')).toBe('staging');
      expect(cache.get_value('greeting')).toBe('Hi alice!'); // Template processed

      // Verify attributes are restored
      const userAttrs = cache.get_attributes('user');
      expect(userAttrs?.readonly).toBe(false);
      expect(userAttrs?.visible).toBe(true);
      expect(userAttrs?.contentTags).toEqual([]);

      const configAttrs = cache.get_attributes('config');
      expect(configAttrs?.readonly).toBe(true);
      expect(configAttrs?.visible).toBe(false);

      const greetingAttrs = cache.get_attributes('greeting');
      expect(greetingAttrs?.template).toBe(true);
      expect(greetingAttrs?.visible).toBe(true);
    });

    test('should migrate legacy format without contentTags/systemTags', () => {
      // Old format without new tag arrays (simulating data from old version)
      const legacyData = {
        user: {
          value: 'alice',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text' as const,
            tags: ['person', 'admin']
          }
        }
      } as any; // Use any to simulate legacy data

      cache.deserialize(legacyData);

      // Should have migrated to new format
      const attrs = cache.get_attributes('user');
      expect(attrs?.contentTags).toEqual(['person', 'admin']);
      expect(attrs?.systemTags).toContain('prompt'); // visible was true
      expect(attrs?.visible).toBe(true);
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
            type: 'text' as const,
            contentTags: [],
            systemTags: ['prompt'] as ('prompt' | 'readonly' | 'protected' | 'template')[],
            tags: [],
            zIndex: 0
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

      // Verify key attributes match
      expect(newCache.get_attributes('name')?.readonly).toBe(cache.get_attributes('name')?.readonly);
      expect(newCache.get_attributes('secret')?.readonly).toBe(cache.get_attributes('secret')?.readonly);
      expect(newCache.get_attributes('message')?.template).toBe(cache.get_attributes('message')?.template);
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
      expect(parsed.test_key.value).toBe('test_value');
      expect(parsed.test_key.attributes.readonly).toBe(true);
      expect(parsed.test_key.attributes.visible).toBe(false);
      expect(parsed.test_key.attributes.template).toBe(true);
      expect(parsed.test_key.attributes.contentTags).toEqual([]);
      expect(parsed.test_key.attributes.systemTags).toContain('readonly');
      expect(parsed.test_key.attributes.systemTags).toContain('template');
    });

    test('should deserialize from JSON string correctly', () => {
      const jsonData = {
        username: {
          value: 'testuser',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text',
            contentTags: [],
            systemTags: ['prompt'],
            tags: []
          }
        },
        template_msg: {
          value: 'Hello {{username}}!',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: true,
            type: 'text',
            contentTags: [],
            systemTags: ['prompt', 'template'],
            tags: []
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
      cache.set_value('name', 'Anonymous User');

      cache.clear();

      expect(cache.get('name')).toBeUndefined();
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
      expect(initialAttrs?.readonly).toBe(true);
      expect(initialAttrs?.visible).toBe(false);
      expect(initialAttrs?.template).toBe(true);

      // Update value only (should preserve all attributes)
      cache.set_value('config', 'updated');

      // All attributes should be preserved
      expect(cache.get_value('config')).toBe('updated');
      const updatedAttrs = cache.get_attributes('config');
      expect(updatedAttrs?.readonly).toBe(true);
      expect(updatedAttrs?.visible).toBe(false);
      expect(updatedAttrs?.template).toBe(true);
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
      const attrs = cache.get_attributes('setting');
      expect(attrs?.readonly).toBe(true);  // Updated
      expect(attrs?.visible).toBe(true);   // Preserved
      expect(attrs?.template).toBe(false); // Preserved
    });
  });

  describe('Template processing after deserialization', () => {
    test('should process templates correctly after deserialization', () => {
      cache.set_value('name', 'World');
      cache.set_value('greeting', 'Hello {{name}}!', { template: true });
      cache.set_value('nested', '{{greeting}} Welcome!', { template: true });

      expect(cache.get_value('greeting')).toBe('Hello World!');
      expect(cache.get_value('nested')).toBe('Hello World! Welcome!');
    });
  });

  describe('ContentTags and SystemTags serialization', () => {
    test('should serialize both contentTags and systemTags', () => {
      cache.set_value('key', 'value');
      cache.addTag('key', 'user-tag');

      const serialized = cache.serialize();

      expect(serialized.key.attributes.contentTags).toEqual(['user-tag']);
      expect(serialized.key.attributes.systemTags).toContain('prompt');
      expect(serialized.key.attributes.tags).toEqual(['user-tag']); // Legacy sync
    });

    test('should deserialize and sync system tags with legacy booleans', () => {
      const data = {
        key: {
          value: 'test',
          attributes: {
            type: 'text' as const,
            contentTags: ['custom'],
            systemTags: ['prompt', 'readonly', 'template'] as ('prompt' | 'readonly' | 'protected' | 'template')[],
            // Legacy values should be overwritten by systemTags
            readonly: false,
            visible: false,
            hardcoded: false,
            template: false,
            tags: [],
            zIndex: 0
          }
        }
      };

      cache.deserialize(data);

      const attrs = cache.get_attributes('key');
      expect(attrs?.visible).toBe(true);    // Synced from 'prompt' in systemTags
      expect(attrs?.readonly).toBe(true);   // Synced from 'readonly' in systemTags
      expect(attrs?.template).toBe(true);   // Synced from 'template' in systemTags
      expect(attrs?.contentTags).toEqual(['custom']);
    });
  });
});
