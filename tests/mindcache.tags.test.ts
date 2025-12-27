import { MindCache } from 'mindcache';

describe('MindCache Tag System', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  // ============================================
  // Content Tag Tests (user-level tags)
  // ============================================

  describe('Content Tags - addTag', () => {
    test('should add a content tag to an existing key', () => {
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

    test('should add tag to key without existing contentTags', () => {
      cache.set('key', 'value');
      // Key starts with empty contentTags array

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

  describe('Content Tags - removeTag', () => {
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

    test('should return false when key has no matching tag', () => {
      cache.set('user', 'Alice');
      // Key starts with empty contentTags array

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

  describe('Content Tags - getTags', () => {
    test('should return all content tags for a key', () => {
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

  describe('Content Tags - hasTag', () => {
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

  describe('Content Tags - getTagged', () => {
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

    test('should process template values', () => {
      cache.set('greeting', 'Hello {{name}}!');
      cache.set('name', 'World');
      cache.set_attributes('greeting', { systemTags: ['ApplyTemplate', 'SystemPrompt', 'LLMWrite'] });

      cache.addTag('greeting', 'template');

      const result = cache.getTagged('template');
      expect(result).toBe('greeting: Hello World!');
    });
  });

  describe('Content Tags - getKeysByTag', () => {
    test('should return array of keys with specific tag', () => {
      cache.set('user1', 'Alice');
      cache.set('user2', 'Bob');
      cache.set('document', 'content');

      cache.addTag('user1', 'person');
      cache.addTag('user2', 'person');
      cache.addTag('document', 'file');

      const keys = cache.getKeysByTag('person');
      expect(keys).toEqual(['user1', 'user2']);
    });

    test('should return empty array when no keys have the tag', () => {
      cache.set('user', 'Alice');
      const keys = cache.getKeysByTag('nonexistent');
      expect(keys).toEqual([]);
    });
  });

  // ============================================
  // System Tag Tests (requires system access)
  // ============================================

  describe('System Tags - Access Level', () => {
    test('should have user access level by default', () => {
      expect(cache.accessLevel).toBe('user');
      expect(cache.hasSystemAccess).toBe(false);
    });

    test('should have admin access when configured', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      expect(systemCache.accessLevel).toBe('admin');
      expect(systemCache.hasSystemAccess).toBe(true);
    });
  });

  describe('System Tags - systemAddTag', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const result = cache.systemAddTag('key', 'protected');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('MindCache: systemAddTag requires system access level');

      consoleSpy.mockRestore();
    });

    test('should add system tag with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set('key', 'value');

      const result = systemCache.systemAddTag('key', 'protected');
      expect(result).toBe(true);
      expect(systemCache.systemGetTags('key')).toContain('protected');
    });

    test('should not add duplicate system tag', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set('key', 'value');

      systemCache.systemAddTag('key', 'protected');
      const result = systemCache.systemAddTag('key', 'protected');
      expect(result).toBe(false);
    });
  });

  describe('System Tags - systemRemoveTag', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const result = cache.systemRemoveTag('key', 'SystemPrompt');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('MindCache: systemRemoveTag requires system access level');

      consoleSpy.mockRestore();
    });

    test('should remove system tag with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('key', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const result = systemCache.systemRemoveTag('key', 'SystemPrompt');
      expect(result).toBe(true);
      expect(systemCache.systemGetTags('key')).not.toContain('SystemPrompt');
    });
  });

  describe('System Tags - systemGetTags', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const tags = cache.systemGetTags('key');
      expect(tags).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('MindCache: systemGetTags requires system access level');

      consoleSpy.mockRestore();
    });

    test('should return system tags with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('key', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const tags = systemCache.systemGetTags('key');
      expect(tags).toContain('SystemPrompt');
      expect(tags).toContain('LLMWrite');
    });
  });

  describe('System Tags - systemHasTag', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const result = cache.systemHasTag('key', 'SystemPrompt');
      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });

    test('should check system tag with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('key', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      expect(systemCache.systemHasTag('key', 'SystemPrompt')).toBe(true);
      expect(systemCache.systemHasTag('key', 'protected')).toBe(false);
    });
  });

  describe('System Tags - systemSetTags', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const result = cache.systemSetTags('key', ['LLMRead', 'protected']);
      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });

    test('should set all system tags at once with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set('key', 'value');

      const result = systemCache.systemSetTags('key', ['LLMRead', 'protected']);
      expect(result).toBe(true);
      expect(systemCache.systemGetTags('key')).toEqual(['LLMRead', 'protected']);
    });
  });

  describe('System Tags - systemGetKeysByTag', () => {
    test('should fail without system access', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      cache.set('key', 'value');

      const keys = cache.systemGetKeysByTag('SystemPrompt');
      expect(keys).toEqual([]);

      consoleSpy.mockRestore();
    });

    test('should return keys with system tag', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('key1', 'value1', { systemTags: ['SystemPrompt'] });
      systemCache.set_value('key2', 'value2', { systemTags: ['SystemPrompt'] });
      systemCache.systemAddTag('key1', 'protected');

      const protectedKeys = systemCache.systemGetKeysByTag('protected');
      expect(protectedKeys).toEqual(['key1']);

      const systemPromptKeys = systemCache.systemGetKeysByTag('SystemPrompt');
      expect(systemPromptKeys).toContain('key1');
      expect(systemPromptKeys).toContain('key2');
    });
  });

  // ============================================
  // Integration Tests
  // ============================================

  describe('Tag integration with other operations', () => {
    test('should preserve content tags when updating value', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');
      cache.addTag('user', 'admin');

      cache.set('user', 'Bob');

      expect(cache.getTags('user')).toEqual(['person', 'admin']);
    });

    test('should preserve content tags when updating attributes', () => {
      cache.set('document', 'content');
      cache.addTag('document', 'important');

      cache.set_attributes('document', { systemTags: [] }); // Remove all system tags

      expect(cache.getTags('document')).toEqual(['important']);
    });

    test('should include contentTags in serialization', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');
      cache.addTag('user', 'admin');

      const serialized = cache.serialize();
      expect(serialized.user.attributes.contentTags).toEqual(['person', 'admin']);
    });

    test('should include systemTags in serialization', () => {
      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.set_value('key', 'value', { systemTags: ['SystemPrompt'] });
      systemCache.systemAddTag('key', 'protected');

      const serialized = systemCache.serialize();
      expect(serialized.key.attributes.systemTags).toContain('SystemPrompt');
      expect(serialized.key.attributes.systemTags).toContain('protected');
    });

    test('should restore data from deserialization (new format)', () => {
      const data = {
        user: {
          value: 'Alice',
          attributes: {
            type: 'text' as const,
            contentTags: ['person', 'admin'],
            systemTags: ['SystemPrompt', 'LLMWrite'] as any[],
            zIndex: 0
          }
        }
      };

      cache.deserialize(data);

      // Value should be restored
      expect(cache.get('user')).toBe('Alice');
      // Tags should be restored
      expect(cache.getTags('user')).toEqual(['person', 'admin']);
    });

    test('should restore tags from deserialization with system access', () => {
      const data = {
        user: {
          value: 'Alice',
          attributes: {
            type: 'text' as const,
            contentTags: ['person', 'admin'],
            systemTags: ['SystemPrompt', 'protected'] as any[],
            zIndex: 0
          }
        }
      };

      const systemCache = new MindCache({ accessLevel: 'admin' });
      systemCache.deserialize(data);

      expect(systemCache.getTags('user')).toEqual(['person', 'admin']);
      expect(systemCache.systemGetTags('user')).toContain('SystemPrompt');
      expect(systemCache.systemGetTags('user')).toContain('protected');
    });

    test('should remove tags when key is deleted', () => {
      cache.set('user', 'Alice');
      cache.addTag('user', 'person');

      cache.delete('user');

      expect(cache.getTags('user')).toEqual([]);
      expect(cache.hasTag('user', 'person')).toBe(false);
    });
  });

  describe('Tag serialization and persistence', () => {
    test('should preserve tags through complete serialize/deserialize cycle', () => {
      cache.set_value('user1', 'Alice');
      cache.set_value('user2', 'Bob', { systemTags: ['LLMRead'] }); // Not in system prompt
      cache.set_value('document', 'content', { systemTags: ['ApplyTemplate', 'SystemPrompt', 'LLMWrite'] });

      cache.addTag('user1', 'person');
      cache.addTag('user1', 'admin');
      cache.addTag('user2', 'person');
      cache.addTag('user2', 'guest');
      cache.addTag('document', 'important');
      cache.addTag('document', 'work');

      const serialized = cache.serialize();

      // Verify serialization includes contentTags
      expect(serialized.user1.attributes.contentTags).toEqual(['person', 'admin']);
      expect(serialized.user2.attributes.contentTags).toEqual(['person', 'guest']);
      expect(serialized.document.attributes.contentTags).toEqual(['important', 'work']);

      // Clear and deserialize
      cache.clear();
      cache.deserialize(serialized);

      // Verify all tags are restored
      expect(cache.getTags('user1')).toEqual(['person', 'admin']);
      expect(cache.getTags('user2')).toEqual(['person', 'guest']);
      expect(cache.getTags('document')).toEqual(['important', 'work']);
    });

    test('should preserve tags through toJSON/fromJSON cycle', () => {
      cache.set('project', 'MindCache');
      cache.addTag('project', 'opensource');
      cache.addTag('project', 'typescript');
      cache.addTag('project', 'library');

      const jsonString = cache.toJSON();

      cache.clear();
      cache.fromJSON(jsonString);

      expect(cache.getTags('project')).toEqual(['opensource', 'typescript', 'library']);
      expect(cache.get('project')).toBe('MindCache');
    });

    test('should handle deserialization of data without contentTags (migration)', () => {
      const oldFormatData = {
        user: {
          value: 'Alice',
          attributes: {
            type: 'text' as const,
            // No contentTags, no systemTags
            zIndex: 0
          }
        }
      } as any; // Use any to simulate legacy data without new fields

      cache.deserialize(oldFormatData);

      // Should have empty contentTags and default systemTags (normalized)
      expect(cache.getTags('user')).toEqual([]);
      expect(cache.get('user')).toBe('Alice');
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
