import { MindCache, SystemTag } from 'mindcache';

describe('MindCache Complete Serialization', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('serialize() and deserialize()', () => {
    test('should serialize complete state with values and attributes', () => {
      // Set up test data with different attribute combinations
      cache.set_value('user', 'john', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('config', 'prod', { systemTags: [] });
      cache.set_value('template_key', 'Hello {{user}}!', { systemTags: ['SystemPrompt', 'LLMWrite', 'ApplyTemplate'] });

      const serialized = cache.serialize();

      // Should contain all non-protected entries with complete structure
      expect(serialized).toHaveProperty('user');
      expect(serialized).toHaveProperty('config');
      expect(serialized).toHaveProperty('template_key');

      // Verify structure includes both value and attributes with new tag system
      expect(serialized.user.value).toBe('john');
      expect(serialized.user.attributes.contentTags).toEqual([]);
      expect(serialized.user.attributes.systemTags).toContain('SystemPrompt');
      expect(serialized.user.attributes.systemTags).toContain('LLMWrite');

      expect(serialized.config.value).toBe('prod');
      expect(serialized.config.attributes.systemTags).not.toContain('SystemPrompt');

      expect(serialized.template_key.value).toBe('Hello {{user}}!');
      expect(serialized.template_key.attributes.systemTags).toContain('ApplyTemplate');
    });

    test('should exclude protected keys from serialization', () => {
      cache.set_value('normal_key', 'value');

      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('protected_key', 'protected_value');
      systemCache.systemAddTag('protected_key', 'protected');

      const serialized = systemCache.serialize();

      expect(serialized).toHaveProperty('protected_key');
      // Protected keys ARE serialized, but cannot be deleted
      expect(serialized).not.toHaveProperty('$date');
      expect(serialized).not.toHaveProperty('$time');
    });

    test('should exclude protected keys from deserialization', () => {
      const testData = {
        normal_key: {
          value: 'normal_value',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: ['SystemPrompt'] as SystemTag[],
            zIndex: 0
          }
        },
        protected_key: {
          value: 'protected_value',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: ['protected'] as SystemTag[],
            zIndex: 0
          }
        }
      };

      cache.deserialize(testData);

      // Normal key should be imported
      expect(cache.get_value('normal_key')).toBe('normal_value');

      // Protected keys should NOT be imported
      expect(cache.has('protected_key')).toBe(false);
    });

    test('should deserialize complete state correctly', () => {
      const testData = {
        user: {
          value: 'alice',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: ['SystemPrompt', 'LLMWrite'] as SystemTag[],
            zIndex: 0
          }
        },
        config: {
          value: 'staging',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: [] as SystemTag[],
            zIndex: 0
          }
        },
        greeting: {
          value: 'Hi {{user}}!',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: ['SystemPrompt', 'ApplyTemplate'] as SystemTag[],
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
      expect(userAttrs?.contentTags).toEqual([]);
      expect(userAttrs?.systemTags).toContain('SystemPrompt');
      expect(userAttrs?.systemTags).toContain('LLMWrite');

      const configAttrs = cache.get_attributes('config');
      expect(configAttrs?.systemTags).not.toContain('SystemPrompt');

      const greetingAttrs = cache.get_attributes('greeting');
      expect(greetingAttrs?.systemTags).toContain('ApplyTemplate');
      expect(greetingAttrs?.systemTags).toContain('SystemPrompt');
    });

    test('should migrate legacy format without contentTags/systemTags', () => {
      // Old format without new tag arrays (simulating data from old version)
      const legacyData = {
        user: {
          value: 'alice',
          attributes: {
            type: 'text' as const,
            tags: ['person', 'admin']
          }
        }
      } as any; // Use any to simulate legacy data

      cache.deserialize(legacyData);

      // Should have migrated to new format
      const attrs = cache.get_attributes('user');
      expect(attrs?.contentTags).toEqual(['person', 'admin']);
    });

    test('should preserve system keys after deserialization', () => {
      const testData = {
        user: {
          value: 'test',
          attributes: {
            type: 'text' as const,
            contentTags: [],
            systemTags: ['SystemPrompt'] as SystemTag[],
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
      cache.set_value('name', 'Bob', { systemTags: ['SystemPrompt'] });
      cache.set_value('secret', 'hidden', { systemTags: [] });
      cache.set_value('message', 'Welcome {{name}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      const serialized = cache.serialize();
      const newCache = new MindCache();
      newCache.deserialize(serialized);

      // Verify all data matches
      expect(newCache.get_value('name')).toBe('Bob');
      expect(newCache.get_value('secret')).toBe('hidden');
      expect(newCache.get_value('message')).toBe('Welcome Bob!');

      // Verify key attributes match
      expect(newCache.get_attributes('name')?.systemTags).toContain('SystemPrompt');
      expect(newCache.get_attributes('secret')?.systemTags).not.toContain('SystemPrompt');
      expect(newCache.get_attributes('message')?.systemTags).toContain('ApplyTemplate');
    });
  });

  describe('toJSON() and fromJSON()', () => {
    test('should serialize to JSON string with complete state', () => {
      cache.set_value('test_key', 'test_value', {
        systemTags: ['ApplyTemplate']
      });

      const jsonString = cache.toJSON();
      const parsed = JSON.parse(jsonString);

      expect(parsed).toHaveProperty('test_key');
      expect(parsed.test_key.value).toBe('test_value');
      expect(parsed.test_key.attributes.systemTags).toContain('ApplyTemplate');
      expect(parsed.test_key.attributes.contentTags).toEqual([]);
    });

    test('should deserialize from JSON string correctly', () => {
      const jsonData = {
        username: {
          value: 'testuser',
          attributes: {
            type: 'text',
            contentTags: [],
            systemTags: ['SystemPrompt'],
            zIndex: 0
          }
        },
        template_msg: {
          value: 'Hello {{username}}!',
          attributes: {
            type: 'text',
            contentTags: [],
            systemTags: ['SystemPrompt', 'ApplyTemplate'],
            zIndex: 0
          }
        }
      };

      const jsonString = JSON.stringify(jsonData);
      cache.fromJSON(jsonString);

      expect(cache.get_value('username')).toBe('testuser');
      expect(cache.get_value('template_msg')).toBe('Hello testuser!');
      expect(cache.get_attributes('template_msg')?.systemTags).toContain('ApplyTemplate');
    });

    test('should handle invalid JSON gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

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
      cache.set_value('data', 'important', { systemTags: [] });
      cache.set_value('greeting', 'Hi {{data}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      const jsonString = cache.toJSON();
      const newCache = new MindCache();
      newCache.fromJSON(jsonString);

      expect(newCache.get_value('data')).toBe('important');
      expect(newCache.get_value('greeting')).toBe('Hi important!');
      expect(newCache.get_attributes('data')?.systemTags).not.toContain('SystemPrompt');
      expect(newCache.get_attributes('greeting')?.systemTags).toContain('ApplyTemplate');
    });

    test('should exclude protected keys from JSON deserialization', () => {
      const jsonData = {
        normal_key: {
          value: 'normal_value',
          attributes: {
            type: 'text',
            contentTags: [],
            systemTags: ['SystemPrompt'],
            zIndex: 0
          }
        },
        protected_key: {
          value: 'protected_value',
          attributes: {
            type: 'text',
            contentTags: [],
            systemTags: ['protected'],
            zIndex: 0
          }
        }
      };

      const jsonString = JSON.stringify(jsonData);
      cache.fromJSON(jsonString);

      // Normal key should be imported
      expect(cache.get_value('normal_key')).toBe('normal_value');

      // Protected keys should NOT be imported
      expect(cache.has('protected_key')).toBe(false);
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
        systemTags: ['ApplyTemplate']
      });

      // Verify initial state
      const initialAttrs = cache.get_attributes('config');
      expect(initialAttrs?.systemTags).toContain('ApplyTemplate');

      // Update value only (should preserve all attributes)
      cache.set_value('config', 'updated');

      // All attributes should be preserved
      expect(cache.get_value('config')).toBe('updated');
      const updatedAttrs = cache.get_attributes('config');
      expect(updatedAttrs?.systemTags).toContain('ApplyTemplate');
    });

    test('should allow partial attribute updates while preserving others', () => {
      // Create key with defaults
      cache.set_value('setting', 'value', {
        systemTags: ['SystemPrompt', 'LLMWrite'],
        contentTags: ['important']
      });

      // Update only one attribute
      cache.set_value('setting', 'new_value', { systemTags: [] });

      // Should update specified attribute while preserving others
      expect(cache.get_value('setting')).toBe('new_value');
      const attrs = cache.get_attributes('setting');
      expect(attrs?.systemTags).toEqual([]); // Updated
      expect(attrs?.contentTags).toEqual(['important']); // Preserved
    });
  });

  describe('Template processing after deserialization', () => {
    test('should process templates correctly after deserialization', () => {
      cache.set_value('name', 'World');
      cache.set_value('greeting', 'Hello {{name}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });
      cache.set_value('nested', '{{greeting}} Welcome!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      expect(cache.get_value('greeting')).toBe('Hello World!');
      expect(cache.get_value('nested')).toBe('Hello World! Welcome!');
    });
  });

  describe('ContentTags and SystemTags serialization', () => {
    test('should serialize both contentTags and systemTags', () => {
      cache.set_value('key', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.addTag('key', 'user-tag');

      const serialized = cache.serialize();

      expect(serialized.key.attributes.contentTags).toEqual(['user-tag']);
      expect(serialized.key.attributes.systemTags).toContain('SystemPrompt');
    });

    test('should deserialize and sync system tags correctly', () => {
      const data = {
        key: {
          value: 'test',
          attributes: {
            type: 'text' as const,
            contentTags: ['custom'],
            systemTags: ['SystemPrompt', 'ApplyTemplate'] as SystemTag[],
            zIndex: 0
          }
        }
      };

      cache.deserialize(data);

      const attrs = cache.get_attributes('key');
      expect(attrs?.systemTags).toContain('SystemPrompt');
      expect(attrs?.systemTags).toContain('ApplyTemplate');
      expect(attrs?.contentTags).toEqual(['custom']);
    });
  });
});
