import { MindCache, mindcache } from '../src/index';

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
      
      expect(cache.size()).toBe(4); // 2 custom + 2 temporal ($date, $time)
      
      cache.clear();
      expect(cache.size()).toBe(2); // Only temporal keys remain
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('Temporal Context ($date and $time)', () => {
    test('should provide current date', () => {
      const date = cache.get('$date');
      const expectedDate = new Date().toISOString().split('T')[0];
      
      expect(date).toBe(expectedDate);
      expect(cache.has('$date')).toBe(true);
    });

    test('should provide current time', () => {
      const time = cache.get('$time');
      const expectedTime = new Date().toTimeString().split(' ')[0];
      
      expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/); // HH:MM:SS format
      expect(cache.has('$time')).toBe(true);
    });

    test('should include temporal keys in keys() method', () => {
      cache.set('custom', 'value');
      const keys = cache.keys();
      
      expect(keys).toContain('$date');
      expect(keys).toContain('$time');
      expect(keys).toContain('custom');
      expect(keys.length).toBe(3);
    });

    test('should include temporal values in values() method', () => {
      cache.set('custom', 'value');
      const values = cache.values();
      
      expect(values).toContain('value');
      expect(values.length).toBe(3);
      
      // Check that date and time values are present
      const dateValue = values.find(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
      const timeValue = values.find(v => typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v));
      
      expect(dateValue).toBeDefined();
      expect(timeValue).toBeDefined();
    });

    test('should include temporal entries in entries() method', () => {
      cache.set('custom', 'value');
      const entries = cache.entries();
      
      const dateEntry = entries.find(([key]) => key === '$date');
      const timeEntry = entries.find(([key]) => key === '$time');
      const customEntry = entries.find(([key]) => key === 'custom');
      
      expect(dateEntry).toBeDefined();
      expect(timeEntry).toBeDefined();
      expect(customEntry).toEqual(['custom', 'value']);
      expect(entries.length).toBe(3);
    });
  });

  describe('Bulk Operations', () => {
    test('should get all context including temporal keys', () => {
      cache.set('name', 'Bob');
      cache.set('age', 25);
      
      const all = cache.getAll();
      
      expect(all.name).toBe('Bob');
      expect(all.age).toBe(25);
      expect(all.$date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(all.$time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
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
      expect(cache.size()).toBe(2); // $date and $time
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(3);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(4);
      
      cache.delete('key1');
      expect(cache.size()).toBe(3);
    });
  });

  describe('Event System', () => {
    test('should notify key-specific listeners on set', () => {
      const listener = jest.fn();
      cache.subscribe('testKey', listener);
      
      cache.set('testKey', 'value');
      expect(listener).toHaveBeenCalledTimes(1);
      
      cache.set('otherKey', 'value');
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called for other keys
    });

    test('should notify key-specific listeners on delete', () => {
      const listener = jest.fn();
      cache.set('testKey', 'value');
      cache.subscribe('testKey', listener);
      
      cache.delete('testKey');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test('should notify global listeners on set', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      expect(globalListener).toHaveBeenCalledTimes(2);
    });

    test('should notify global listeners on delete', () => {
      const globalListener = jest.fn();
      cache.set('testKey', 'value');
      cache.subscribeToAll(globalListener);
      
      cache.delete('testKey');
      expect(globalListener).toHaveBeenCalledTimes(1);
    });

    test('should notify global listeners on update', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);
      
      cache.update({ key1: 'value1', key2: 'value2' });
      expect(globalListener).toHaveBeenCalledTimes(1);
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
      expect(listener).toHaveBeenCalledTimes(1);
      
      cache.unsubscribe('testKey', listener);
      cache.set('testKey', 'value2');
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called after unsubscribe
    });

    test('should unsubscribe global listeners', () => {
      const globalListener = jest.fn();
      cache.subscribeToAll(globalListener);
      
      cache.set('key1', 'value1');
      expect(globalListener).toHaveBeenCalledTimes(1);
      
      cache.unsubscribeFromAll(globalListener);
      cache.set('key2', 'value2');
      expect(globalListener).toHaveBeenCalledTimes(1); // Should not be called after unsubscribe
    });
  });

  describe('Template Injection', () => {
    test('should inject context values into templates', () => {
      cache.set('name', 'David');
      cache.set('city', 'New York');
      
      const result = cache.injectSTM('Hello {name} from {city}!');
      expect(result).toBe('Hello David from New York!');
    });

    test('should inject temporal context values', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = cache.injectSTM('Today is {$date}');
      expect(result).toBe(`Today is ${today}`);
    });

    test('should handle missing keys gracefully', () => {
      cache.set('name', 'Eve');
      
      const result = cache.injectSTM('Hello {name}, you live in {city}');
      expect(result).toBe('Hello Eve, you live in '); // Missing key becomes empty string
    });

    test('should return template unchanged if no placeholders', () => {
      const template = 'This is a plain string';
      const result = cache.injectSTM(template);
      expect(result).toBe(template);
    });

    test('should handle complex object values', () => {
      cache.set('user', { name: 'Frank', age: 35 });
      
      const result = cache.injectSTM('User: {user}');
      expect(result).toBe('User: [object Object]'); // Objects get toString() treatment
    });

    test('should handle multiple occurrences of the same placeholder', () => {
      cache.set('name', 'Grace');
      
      const result = cache.injectSTM('{name} says hello to {name}');
      expect(result).toBe('Grace says hello to Grace');
    });
  });

  describe('Context Serialization', () => {
    test('should serialize context to string format', () => {
      cache.set('name', 'Henry');
      cache.set('age', 40);
      
      const contextString = cache.getSTM();
      
      expect(contextString).toContain('name: Henry');
      expect(contextString).toContain('age: 40');
      expect(contextString).toContain('$date:');
      expect(contextString).toContain('$time:');
    });

    test('should handle empty context', () => {
      const contextString = cache.getSTM();
      
      expect(contextString).toContain('$date:');
      expect(contextString).toContain('$time:');
      expect(contextString.split(', ')).toHaveLength(2); // Only temporal keys
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
      
      // Simulate another import
      const { mindcache: anotherRef } = require('../src/index');
      expect(anotherRef.get('persistent')).toBe('value');
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
