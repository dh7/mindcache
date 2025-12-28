import { MindCache, mindcache } from 'mindcache';

describe('MindCache', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('Basic CRUD Operations', () => {
    test('should set and get values', () => {
      cache.set('name', 'Alice');
      cache.set('age', 30);
      cache.set('preferences', { theme: 'dark', lang: 'en' });

      expect(cache.get('name')).toBe('Alice');
      expect(cache.get('age')).toBe(30);
      expect(cache.get('preferences')).toEqual({ theme: 'dark', lang: 'en' });
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should check if keys exist', () => {
      cache.set('existing', 'value');

      expect(cache.has('existing')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('should delete values', () => {
      cache.set('toDelete', 'value');
      expect(cache.has('toDelete')).toBe(true);

      const deleted = cache.delete('toDelete');
      expect(deleted).toBe(true);
      expect(cache.has('toDelete')).toBe(false);
      expect(cache.get('toDelete')).toBeUndefined();
    });

    test('should return false when deleting non-existent keys', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    test('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.size()).toBe(2); // 2 custom keys

      cache.clear();
      expect(cache.size()).toBe(0); // No keys remain
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('Template Variables ($date, $time, $version)', () => {
    test('should substitute $date in templates', () => {
      cache.set_value('message', 'Today is {{$date}}', { systemTags: ['ApplyTemplate'] });
      const result = cache.get_value('message');
      expect(result).toMatch(/Today is \d{4}-\d{2}-\d{2}/);
    });

    test('should substitute $time in templates', () => {
      cache.set_value('message', 'The time is {{$time}}', { systemTags: ['ApplyTemplate'] });
      const result = cache.get_value('message');
      expect(result).toMatch(/The time is \d{2}:\d{2}:\d{2}/);
    });

    test('should substitute $version in templates', () => {
      cache.set_value('message', 'Version: {{$version}}', { systemTags: ['ApplyTemplate'] });
      const result = cache.get_value('message');
      expect(result).toMatch(/Version: \d+\.\d+\.\d+/);
    });

    test('$date/$time/$version are NOT real keys', () => {
      // They don't exist as keys
      expect(cache.has('$date')).toBe(false);
      expect(cache.has('$time')).toBe(false);
      expect(cache.has('$version')).toBe(false);

      // They don't appear in keys/values
      expect(cache.keys()).not.toContain('$date');
      expect(cache.keys()).not.toContain('$time');

      // get_value returns undefined
      expect(cache.get_value('$date')).toBeUndefined();
      expect(cache.get_value('$time')).toBeUndefined();
    });
  });

  describe('Bulk Operations', () => {
    test('should get all values', () => {
      cache.set('name', 'Bob');
      cache.set('age', 25);

      const all = cache.getAll();

      expect(all.name).toBe('Bob');
      expect(all.age).toBe(25);
      // No $date/$time - they're only template variables
      expect(all.$date).toBeUndefined();
      expect(all.$time).toBeUndefined();
    });

    test('should update context with multiple values', () => {
      cache.set('existing', 'old');

      cache.update({
        existing: 'new',
        name: 'Charlie',
        settings: { notifications: true }
      });

      expect(cache.get('existing')).toBe('new');
      expect(cache.get('name')).toBe('Charlie');
      expect(cache.get('settings')).toEqual({ notifications: true });
    });

    test('should return correct size', () => {
      expect(cache.size()).toBe(0); // Empty

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('Event System', () => {
    test('should notify key-specific listeners on set', () => {
      const listener = jest.fn();
      cache.subscribe('testKey', listener);

      cache.set('testKey', 'value');
      expect(listener).toHaveBeenCalled();

      const callCount = listener.mock.calls.length;
      cache.set('otherKey', 'value');
      // Should not be called for other keys
      expect(listener).toHaveBeenCalledTimes(callCount);
    });

    test('should notify key-specific listeners on delete', () => {
      const listener = jest.fn();
      cache.set('testKey', 'value');
      cache.subscribe('testKey', listener);

      cache.delete('testKey');
      expect(listener).toHaveBeenCalled();
    });

    test('should notify global listeners on set', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // At least 2 notifications (may be more due to Yjs internals)
      expect(globalListener.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('should notify global listeners on delete', () => {
      const globalListener = jest.fn();
      cache.set('testKey', 'value');
      cache.subscribeToAll(globalListener);

      cache.delete('testKey');
      expect(globalListener).toHaveBeenCalled();
    });

    test('should notify global listeners on update', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);

      cache.update({ key1: 'value1', key2: 'value2' });
      expect(globalListener).toHaveBeenCalled();
    });

    test('should notify global listeners on clear', () => {
      const globalListener = jest.fn();
      cache.set('testKey', 'value');
      cache.subscribeToAll(globalListener);

      cache.clear();
      expect(globalListener).toHaveBeenCalledTimes(1);
    });

    test('should unsubscribe key-specific listeners', () => {
      const listener = jest.fn();
      cache.subscribe('testKey', listener);

      cache.set('testKey', 'value1');
      expect(listener).toHaveBeenCalled();

      const callCountBefore = listener.mock.calls.length;
      cache.unsubscribe('testKey', listener);
      cache.set('testKey', 'value2');
      expect(listener).toHaveBeenCalledTimes(callCountBefore); // Should not be called after unsubscribe
    });

    test('should unsubscribe global listeners', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);

      cache.set('key1', 'value1');
      expect(globalListener).toHaveBeenCalled();

      const callCountBefore = globalListener.mock.calls.length;
      cache.unsubscribeFromAll(globalListener);
      cache.set('key2', 'value2');
      expect(globalListener).toHaveBeenCalledTimes(callCountBefore); // Should not be called after unsubscribe
    });
  });

  describe('Template Injection', () => {
    test('should inject context values into templates', () => {
      cache.set('name', 'David');
      cache.set('city', 'New York');

      const result = cache.injectSTM('Hello {{name}} from {{city}}!');
      expect(result).toBe('Hello David from New York!');
    });

    test('should inject temporal context values', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = cache.injectSTM('Today is {{$date}}');
      expect(result).toBe(`Today is ${today}`);
    });

    test('should handle missing keys gracefully', () => {
      cache.set('name', 'Eve');

      const result = cache.injectSTM('Hello {{name}}, you live in {{city}}');
      // Missing keys replaced with empty string
      expect(result).toBe('Hello Eve, you live in ');
    });

    test('should handle image and file placeholders', () => {
      cache.set_base64('profile_pic', 'base64data', 'image/png', 'image');
      cache.set_base64('document', 'base64data', 'application/pdf', 'file');
      cache.set('username', 'Alice');

      const result = cache.injectSTM('User {{username}} has image {{profile_pic}} and file {{document}}');
      // Images and files return their stored value when injected
      expect(result).toContain('User Alice has image');
      expect(result).toContain('base64data');
    });

    test('should return template unchanged if no placeholders', () => {
      const template = 'This is a plain string';
      const result = cache.injectSTM(template);
      expect(result).toBe(template);
    });

    test('should handle complex object values', () => {
      cache.set('user', { name: 'Frank', age: 35 });

      const result = cache.injectSTM('User: {{user}}');
      expect(result).toBe('User: [object Object]'); // Objects get toString() treatment
    });

    test('should handle multiple occurrences of the same placeholder', () => {
      cache.set('name', 'Grace');

      const result = cache.injectSTM('{{name}} says hello to {{name}}');
      expect(result).toBe('Grace says hello to Grace');
    });
  });

  describe('Context Serialization', () => {
    test('should serialize context to string format', () => {
      cache.set_value('name', 'Henry', { systemTags: ['SystemPrompt'] });
      cache.set_value('age', 40, { systemTags: ['SystemPrompt'] });

      const contextString = cache.getSTM();

      expect(contextString).toContain('name: Henry');
      expect(contextString).toContain('age: 40');
    });

    test('should handle empty context', () => {
      const contextString = cache.getSTM();

      // Empty when no visible keys
      expect(contextString).toBe('');
    });
  });

  describe('Singleton Instance', () => {
    test('should export a singleton instance', () => {
      expect(mindcache).toBeInstanceOf(MindCache);

      mindcache.set('singleton-test', 'works');
      expect(mindcache.get('singleton-test')).toBe('works');
    });

    test('should maintain state across imports', () => {
      mindcache.set('persistent', 'value');

      // Simulate another import - use package name since tests import from 'mindcache'
      const { mindcache: anotherRef } = require('mindcache');
      expect(anotherRef.get('persistent')).toBe('value');
    });
  });

  describe('Serialization/Deserialization', () => {
    test('should serialize STM to object format', () => {
      cache.set('name', 'Alice');
      cache.set('age', 30);
      cache.set('preferences', { theme: 'dark' });

      const serialized = cache.getAll(); // Use getAll() for values-only format

      expect(typeof serialized).toBe('object');
      expect(serialized.name).toBe('Alice');
      expect(serialized.age).toBe(30);
      expect(serialized.preferences).toEqual({ theme: 'dark' });
      // No $date/$time - they're template-only variables
    });

    test('should serialize empty STM', () => {
      const serialized = cache.getAll();

      expect(Object.keys(serialized)).toHaveLength(0);
    });

    test('should deserialize object data correctly', () => {
      // Using legacy format to test migration (cast to any to simulate old data)
      const testData = {
        name: {
          value: 'Bob',
          attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text' as const, tags: [] }
        },
        age: {
          value: 25,
          attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text' as const, tags: [] }
        },
        settings: {
          value: { notifications: true },
          attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text' as const, tags: [] }
        }
      } as any;

      cache.deserialize(testData);

      expect(cache.get('name')).toBe('Bob');
      expect(cache.get('age')).toBe(25);
      expect(cache.get('settings')).toEqual({ notifications: true });

      // Should have migrated to new tag format (with empty defaults)
      expect(cache.get_attributes('name')?.contentTags).toEqual([]);
      expect(cache.get_attributes('name')?.systemTags).toEqual([]);
    });

    test('should clear existing data before deserializing', () => {
      // Set initial data
      cache.set('existing', 'old');
      cache.set('toBeRemoved', 'value');

      // Deserialize new data (without toBeRemoved) - using legacy format
      cache.deserialize({
        existing: {
          value: 'new',
          attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text' as const, tags: [] }
        },
        newKey: {
          value: 'newValue',
          attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text' as const, tags: [] }
        }
      } as any);

      expect(cache.get('existing')).toBe('new');
      expect(cache.get('newKey')).toBe('newValue');
      expect(cache.get('toBeRemoved')).toBeUndefined();
    });

    test('should handle null/undefined in deserialize gracefully', () => {
      cache.set('existing', 'value');

      cache.deserialize(null as any);
      expect(cache.get('existing')).toBe('value'); // Should remain unchanged

      cache.deserialize(undefined as any);
      expect(cache.get('existing')).toBe('value'); // Should remain unchanged
    });

    test('should serialize to JSON string', () => {
      cache.set('name', 'Charlie');
      cache.set('count', 42);

      const jsonString = cache.toJSON();

      expect(typeof jsonString).toBe('string');

      const parsed = JSON.parse(jsonString);
      expect(parsed.name.value).toBe('Charlie');
      expect(parsed.count.value).toBe(42);
      expect(parsed.name.attributes).toBeDefined();
      expect(parsed.count.attributes).toBeDefined();
      // System keys are not included in serialize()
      expect(parsed.$date).toBeUndefined();
      expect(parsed.$time).toBeUndefined();
    });

    test('should deserialize from JSON string', () => {
      const testData = {
        name: {
          value: 'David'
        },
        active: {
          value: true
        },
        metadata: {
          value: { version: 1 }
        }
      };

      const jsonString = JSON.stringify(testData);

      // fromJSON expects a serialized format with attributes
      cache.set('name', 'David');
      cache.set('active', true);
      cache.set('metadata', { version: 1 });

      const properJson = cache.toJSON();
      cache.clear();
      cache.fromJSON(properJson);

      expect(cache.get('name')).toBe('David');
      expect(cache.get('active')).toBe(true);
      expect(cache.get('metadata')).toEqual({ version: 1 });
    });

    test('should handle invalid JSON gracefully', () => {
      cache.set('existing', 'value');

      // Mock console.error to avoid test output pollution
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      cache.fromJSON('invalid json {');

      // Should not crash and existing data should remain
      expect(cache.get('existing')).toBe('value');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('should roundtrip serialize/deserialize correctly', () => {
      // Set up test data
      cache.set('name', 'Eve');
      cache.set('age', 28);
      cache.set('preferences', { theme: 'light', lang: 'es' });
      cache.set('tags', ['developer', 'designer']);

      // Serialize
      const serialized = cache.serialize();

      // Create new cache and deserialize
      const newCache = new MindCache();
      newCache.deserialize(serialized);

      // Verify all data transferred correctly
      expect(newCache.get('name')).toBe('Eve');
      expect(newCache.get('age')).toBe(28);
      expect(newCache.get('preferences')).toEqual({ theme: 'light', lang: 'es' });
      expect(newCache.get('tags')).toEqual(['developer', 'designer']);
    });

    test('should roundtrip JSON serialize/deserialize correctly', () => {
      // Set up test data
      cache.set('user', 'Frank');
      cache.set('score', 95);
      cache.set('config', { debug: false });

      // JSON serialize
      const jsonString = cache.toJSON();

      // Create new cache and JSON deserialize
      const newCache = new MindCache();
      newCache.fromJSON(jsonString);

      // Verify all data transferred correctly
      expect(newCache.get('user')).toBe('Frank');
      expect(newCache.get('score')).toBe(95);
      expect(newCache.get('config')).toEqual({ debug: false });
    });

    test('should preserve data types during serialization', () => {
      cache.set('string', 'text');
      cache.set('number', 123);
      cache.set('boolean', true);
      cache.set('null', null);
      cache.set('undefined', undefined);
      cache.set('array', [1, 2, 3]);
      cache.set('object', { key: 'value' });

      const serialized = cache.serialize();

      expect(typeof serialized.string.value).toBe('string');
      expect(typeof serialized.number.value).toBe('number');
      expect(typeof serialized.boolean.value).toBe('boolean');
      expect(serialized.null.value).toBeNull();
      expect(serialized.undefined.value).toBeUndefined();
      expect(Array.isArray(serialized.array.value)).toBe(true);
      expect(typeof serialized.object.value).toBe('object');
    });

    test('should handle complex nested structures', () => {
      const complexData = {
        user: {
          profile: {
            name: 'Grace',
            contacts: ['email@example.com', 'phone'],
            settings: {
              notifications: true,
              privacy: { level: 'high' }
            }
          }
        },
        sessions: [
          { id: 1, active: true },
          { id: 2, active: false }
        ]
      };

      cache.set('complex', complexData);

      const serialized = cache.serialize();
      const newCache = new MindCache();
      newCache.deserialize(serialized);

      expect(newCache.get('complex')).toEqual(complexData);
    });

    test('should getSTMObject return values format', () => {
      cache.set('test', 'value');

      const serialized = cache.serialize(); // Complete format with attributes
      const stmObject = cache.getSTMObject(); // Values-only format

      // They should have different formats
      expect(serialized.test.value).toBe('value');
      expect(serialized.test.attributes).toBeDefined();
      expect(stmObject.test).toBe('value');
      // No $date/$time - they're template-only variables
    });
  });

  describe('Edge Cases', () => {
    test('should handle null and undefined values', () => {
      cache.set('nullValue', null);
      cache.set('undefinedValue', undefined);

      expect(cache.get('nullValue')).toBeNull();
      expect(cache.get('undefinedValue')).toBeUndefined();
      expect(cache.has('nullValue')).toBe(true);
      expect(cache.has('undefinedValue')).toBe(true);
    });

    test('should handle boolean values', () => {
      cache.set('trueValue', true);
      cache.set('falseValue', false);

      expect(cache.get('trueValue')).toBe(true);
      expect(cache.get('falseValue')).toBe(false);
    });

    test('should handle array values', () => {
      const testArray = [1, 2, 3, 'test'];
      cache.set('arrayValue', testArray);

      expect(cache.get('arrayValue')).toEqual(testArray);
    });

    test('should handle nested object values', () => {
      const nestedObject = {
        level1: {
          level2: {
            value: 'deep'
          }
        }
      };

      cache.set('nested', nestedObject);
      expect(cache.get('nested')).toEqual(nestedObject);
    });
  });
});
