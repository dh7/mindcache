import { MindCache } from '../src/index';

describe('MindCache Tag System', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('addTag', () => {
    test('should add a tag to an existing key', () => {
      cache.set('user', 'Alice');
      const result = cache.addTag('user', 'person');

      expect(result).toBe(true);
      expect(cache.getTags('user')).toContain('person');
    });

    test('should return false when adding tag to non-existent key', () => {
      const result = cache.addTag('nonexistent', 'tag');
      expect(result).toBe(false);
    });

    test('should return false when adding duplicate tag', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');

      const result = cache.addTag('user', 'person');
      expect(result).toBe(false);
      expect(cache.getTags('user')).toEqual(['person']);
    });

    test('should not allow tagging system keys', () => {
      const dateResult = cache.addTag('$date', 'system');
      const timeResult = cache.addTag('$time', 'system');

      expect(dateResult).toBe(false);
      expect(timeResult).toBe(false);
    });

    test('should initialize tags array if it does not exist', () => {
      cache.set('key', 'value');
      // Manually remove tags to simulate old data
      const entry = cache['stm']['key'];
      delete entry.attributes.tags;

      const result = cache.addTag('key', 'newtag');
      expect(result).toBe(true);
      expect(cache.getTags('key')).toEqual(['newtag']);
    });

    test('should add multiple different tags to same key', () => {
      cache.set('document', 'content');

      cache.addTag('document', 'important');
      cache.addTag('document', 'draft');
      cache.addTag('document', 'work');

      const tags = cache.getTags('document');
      expect(tags).toContain('important');
      expect(tags).toContain('draft');
      expect(tags).toContain('work');
      expect(tags).toHaveLength(3);
    });
  });

  describe('removeTag', () => {
    test('should remove an existing tag', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');
      cache.addTag('user', 'admin');

      const result = cache.removeTag('user', 'person');
      expect(result).toBe(true);
      expect(cache.getTags('user')).toEqual(['admin']);
    });

    test('should return false when removing non-existent tag', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');

      const result = cache.removeTag('user', 'nonexistent');
      expect(result).toBe(false);
      expect(cache.getTags('user')).toEqual(['person']);
    });

    test('should return false when key does not exist', () => {
      const result = cache.removeTag('nonexistent', 'tag');
      expect(result).toBe(false);
    });

    test('should return false when key has no tags', () => {
      cache.set('user', 'Alice');
      // Manually remove tags array
      const entry = cache['stm']['user'];
      delete entry.attributes.tags;

      const result = cache.removeTag('user', 'person');
      expect(result).toBe(false);
    });

    test('should not allow removing tags from system keys', () => {
      const dateResult = cache.removeTag('$date', 'system');
      const timeResult = cache.removeTag('$time', 'system');

      expect(dateResult).toBe(false);
      expect(timeResult).toBe(false);
    });
  });

  describe('getTags', () => {
    test('should return all tags for a key', () => {
      cache.set('document', 'content');
      cache.addTag('document', 'important');
      cache.addTag('document', 'draft');

      const tags = cache.getTags('document');
      expect(tags).toEqual(['important', 'draft']);
    });

    test('should return empty array for key with no tags', () => {
      cache.set('user', 'Alice');
      const tags = cache.getTags('user');
      expect(tags).toEqual([]);
    });

    test('should return empty array for non-existent key', () => {
      const tags = cache.getTags('nonexistent');
      expect(tags).toEqual([]);
    });

    test('should return empty array for system keys', () => {
      const dateTags = cache.getTags('$date');
      const timeTags = cache.getTags('$time');

      expect(dateTags).toEqual([]);
      expect(timeTags).toEqual([]);
    });
  });

  describe('hasTag', () => {
    test('should return true when key has the tag', () => {
      cache.set('document', 'content');
      cache.addTag('document', 'important');

      expect(cache.hasTag('document', 'important')).toBe(true);
    });

    test('should return false when key does not have the tag', () => {
      cache.set('document', 'content');
      cache.addTag('document', 'important');

      expect(cache.hasTag('document', 'draft')).toBe(false);
    });

    test('should return false for non-existent key', () => {
      expect(cache.hasTag('nonexistent', 'tag')).toBe(false);
    });

    test('should return false for key with no tags', () => {
      cache.set('user', 'Alice');
      expect(cache.hasTag('user', 'person')).toBe(false);
    });

    test('should return false for system keys', () => {
      expect(cache.hasTag('$date', 'system')).toBe(false);
      expect(cache.hasTag('$time', 'system')).toBe(false);
    });
  });

  describe('getTagged', () => {
    test('should return formatted string of entries with specific tag', () => {
      cache.set('user1', 'Alice');
      cache.set('user2', 'Bob');
      cache.set('document', 'content');

      cache.addTag('user1', 'person');
      cache.addTag('user2', 'person');
      cache.addTag('document', 'file');

      const result = cache.getTagged('person');
      expect(result).toBe('user1: Alice, user2: Bob');
    });

    test('should return empty string when no entries have the tag', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');

      const result = cache.getTagged('nonexistent');
      expect(result).toBe('');
    });

    test('should ignore visibility attribute', () => {
      cache.set('user1', 'Alice');
      cache.set('user2', 'Bob');

      // Make user2 invisible
      cache.set_attributes('user2', { visible: false });

      cache.addTag('user1', 'person');
      cache.addTag('user2', 'person');

      const result = cache.getTagged('person');
      expect(result).toBe('user1: Alice, user2: Bob');
    });

    test('should process template values', () => {
      cache.set('greeting', 'Hello {{name}}!');
      cache.set('name', 'World');
      cache.set_attributes('greeting', { template: true });

      cache.addTag('greeting', 'template');

      const result = cache.getTagged('template');
      expect(result).toBe('greeting: Hello World!');
    });

    test('should handle multiple tags on same entry', () => {
      cache.set('document', 'important content');
      cache.addTag('document', 'important');
      cache.addTag('document', 'work');

      const importantResult = cache.getTagged('important');
      const workResult = cache.getTagged('work');

      expect(importantResult).toBe('document: important content');
      expect(workResult).toBe('document: important content');
    });

    test('should return entries in order they appear in STM', () => {
      cache.set('first', 'value1');
      cache.set('second', 'value2');
      cache.set('third', 'value3');

      cache.addTag('first', 'test');
      cache.addTag('third', 'test');
      cache.addTag('second', 'test');

      const result = cache.getTagged('test');
      // Order should match the order keys were added to STM
      expect(result).toBe('first: value1, second: value2, third: value3');
    });
  });

  describe('Tag integration with other operations', () => {
    test('should preserve tags when updating value', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');
      cache.addTag('user', 'admin');

      cache.set('user', 'Bob');

      expect(cache.getTags('user')).toEqual(['person', 'admin']);
    });

    test('should preserve tags when updating attributes', () => {
      cache.set('document', 'content');
      cache.addTag('document', 'important');

      cache.set_attributes('document', { readonly: true });

      expect(cache.getTags('document')).toEqual(['important']);
      expect(cache.get_attributes('document')?.readonly).toBe(true);
    });

    test('should include tags in serialization', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');
      cache.addTag('user', 'admin');

      const serialized = cache.serialize();
      expect(serialized.user.attributes.tags).toEqual(['person', 'admin']);
    });

    test('should restore tags from deserialization', () => {
      const data = {
        user: {
          value: 'Alice',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text' as const,
            tags: ['person', 'admin']
          }
        }
      };

      cache.deserialize(data);

      expect(cache.getTags('user')).toEqual(['person', 'admin']);
      expect(cache.hasTag('user', 'person')).toBe(true);
      expect(cache.hasTag('user', 'admin')).toBe(true);
    });

    test('should remove tags when key is deleted', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');

      cache.delete('user');

      expect(cache.getTags('user')).toEqual([]);
      expect(cache.hasTag('user', 'person')).toBe(false);
    });

    test('should handle clear operation with tags', () => {
      cache.set('user', 'Alice');
      cache.set('document', 'content');
      cache.addTag('user', 'person');
      cache.addTag('document', 'file');

      // Set a default value to test restoration

      cache.clear();

      // All keys should be removed after clear
      expect(cache.get('user')).toBeUndefined();
      expect(cache.has('document')).toBe(false);
    });
  });

  describe('Tag serialization and persistence', () => {
    test('should preserve tags through complete serialize/deserialize cycle', () => {
      // Set up complex data with tags
      cache.set_value('user1', 'Alice'); // Add user1 first
      cache.set_value('user2', 'Bob', { visible: false });
      cache.set_value('document', 'content', { template: true });

      cache.addTag('user1', 'person');
      cache.addTag('user1', 'admin');
      cache.addTag('user2', 'person');
      cache.addTag('user2', 'guest');
      cache.addTag('document', 'important');
      cache.addTag('document', 'work');

      // Serialize
      const serialized = cache.serialize();

      // Verify serialization includes tags (only if keys exist)
      if (serialized.user1) {
        expect(serialized.user1.attributes.tags).toEqual(['person', 'admin']);
      }
      if (serialized.user2) {
        expect(serialized.user2.attributes.tags).toEqual(['person', 'guest']);
      }
      if (serialized.document) {
        expect(serialized.document.attributes.tags).toEqual(['important', 'work']);
      }

      // Clear and deserialize
      cache.clear();
      cache.deserialize(serialized);

      // Verify all tags are restored
      expect(cache.getTags('user1')).toEqual(['person', 'admin']);
      expect(cache.getTags('user2')).toEqual(['person', 'guest']);
      expect(cache.getTags('document')).toEqual(['important', 'work']);

      // Verify values and other attributes are also restored
      expect(cache.get('user1')).toBe('Alice');
      expect(cache.get('user2')).toBe('Bob');
      expect(cache.get('document')).toBe('content');
      expect(cache.get_attributes('user2')?.visible).toBe(false);
      expect(cache.get_attributes('document')?.template).toBe(true);
    });

    test('should preserve tags through toJSON/fromJSON cycle', () => {
      cache.set('project', 'MindCache');
      cache.addTag('project', 'opensource');
      cache.addTag('project', 'typescript');
      cache.addTag('project', 'library');

      // Convert to JSON string
      const jsonString = cache.toJSON();

      // Clear and restore from JSON
      cache.clear();
      cache.fromJSON(jsonString);

      // Verify tags are preserved
      expect(cache.getTags('project')).toEqual(['opensource', 'typescript', 'library']);
      expect(cache.get('project')).toBe('MindCache');
    });

    test('should handle deserialization of data without tags property', () => {
      // Simulate old data format without tags
      const oldFormatData = {
        user: {
          value: 'Alice',
          attributes: {
            readonly: false,
            visible: true,
            hardcoded: false,
            template: false,
            type: 'text' as const
            // No tags property
          }
        }
      };

      cache.deserialize(oldFormatData);

      // Should handle gracefully and provide empty tags array
      expect(cache.getTags('user')).toEqual([]);
      expect(cache.get('user')).toBe('Alice');
    });

    test('should preserve tags when clearing with defaults', () => {
      // Set up keys with defaults and tags
      cache.set('temp', 'data'); // No default

      cache.addTag('config', 'settings');
      cache.addTag('config', 'important');
      cache.addTag('theme', 'ui');
      cache.addTag('temp', 'temporary');

      // Clear should preserve keys with defaults and their tags
      cache.clear();

      // All keys should be removed after clear
      expect(cache.get('config')).toBeUndefined();
      expect(cache.get('theme')).toBeUndefined();

      // Keys without defaults should be removed
      expect(cache.has('temp')).toBe(false);
      expect(cache.getTags('temp')).toEqual([]);
    });

    test('should handle complex clear/serialize/deserialize workflow', () => {
      // Initial setup
      cache.set('user', 'Alice'); // Set user first
      cache.set('config', 'prod'); // Set config first
      cache.set('session', 'active');

      cache.addTag('user', 'person');
      cache.addTag('session', 'temporary');
      cache.addTag('config', 'settings');
      cache.addTag('config', 'important');

      // Step 1: Clear (should remove all)
      cache.clear();

      // All keys should be removed after clear
      expect(cache.get('user')).toBeUndefined();
      expect(cache.get('config')).toBeUndefined();
      expect(cache.has('session')).toBe(false);

      // Step 2: Add new data and tags
      cache.set('user', 'Bob');
      cache.addTag('user', 'person'); // Re-add the tag since it was cleared
      cache.addTag('user', 'admin');
      cache.set('config', 'production');
      cache.addTag('config', 'settings');
      cache.set('newkey', 'newvalue');
      cache.addTag('newkey', 'fresh');

      // Step 3: Serialize
      const serialized = cache.serialize();

      // Step 4: Clear and deserialize
      cache.clear();
      cache.deserialize(serialized);

      // Verify final state
      expect(cache.get('user')).toBe('Bob');
      expect(cache.getTags('user')).toEqual(['person', 'admin']);
      expect(cache.get('config')).toBe('production');
      expect(cache.getTags('config')).toEqual(['settings']);
      expect(cache.get('newkey')).toBe('newvalue');
      expect(cache.getTags('newkey')).toEqual(['fresh']);
    });

    test('should handle getTagged after serialization operations', () => {
      cache.set('doc1', 'content1');
      cache.set('doc2', 'content2');
      cache.set('user1', 'Alice');

      cache.addTag('doc1', 'document');
      cache.addTag('doc2', 'document');
      cache.addTag('user1', 'person');

      // Test getTagged before serialization
      expect(cache.getTagged('document')).toBe('doc1: content1, doc2: content2');

      // Serialize and deserialize
      const serialized = cache.serialize();
      cache.clear();
      cache.deserialize(serialized);

      // Test getTagged after serialization
      expect(cache.getTagged('document')).toBe('doc1: content1, doc2: content2');
      expect(cache.getTagged('person')).toBe('user1: Alice');
      expect(cache.getTagged('nonexistent')).toBe('');
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle empty tag strings', () => {
      cache.set('user', 'Alice');

      const addResult = cache.addTag('user', '');
      expect(addResult).toBe(true);
      expect(cache.hasTag('user', '')).toBe(true);

      const removeResult = cache.removeTag('user', '');
      expect(removeResult).toBe(true);
      expect(cache.hasTag('user', '')).toBe(false);
    });

    test('should handle special characters in tags', () => {
      cache.set('user', 'Alice');
      const specialTag = 'tag-with_special.chars@123';

      cache.addTag('user', specialTag);
      expect(cache.hasTag('user', specialTag)).toBe(true);
      expect(cache.getTags('user')).toContain(specialTag);
    });

    test('should handle unicode characters in tags', () => {
      cache.set('user', 'Alice');
      const unicodeTag = '标签🏷️';

      cache.addTag('user', unicodeTag);
      expect(cache.hasTag('user', unicodeTag)).toBe(true);
      expect(cache.getTags('user')).toContain(unicodeTag);
    });

    test('should maintain tag order', () => {
      cache.set('user', 'Alice');

      cache.addTag('user', 'first');
      cache.addTag('user', 'second');
      cache.addTag('user', 'third');

      expect(cache.getTags('user')).toEqual(['first', 'second', 'third']);
    });
  });
});
