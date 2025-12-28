import { describe, test, expect, beforeEach } from 'vitest';
import { MindCache } from './MindCache';

describe('MindCache Tooling', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
    cache.clear();
  });

  describe('get_aisdk_tools', () => {
    test('should generate tools for writable keys only', () => {
      cache.set_value('writable_key', 'value1', { systemTags: ['LLMWrite'] });
      cache.set_value('readonly_key', 'value2', { systemTags: ['SystemPrompt'] });

      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).toContain('write_writable_key');
      expect(toolNames).not.toContain('write_readonly_key');
    });

    test('should not generate tools for system keys', () => {
      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).not.toContain('write_$date');
      expect(toolNames).not.toContain('write_$time');
    });

    test('should sanitize key names for tool names', () => {
      cache.set_value('my-special@key!', 'value1', { systemTags: ['LLMWrite'] });
      cache.set_value('normal_key', 'value2', { systemTags: ['LLMWrite'] });
      cache.set_value('key with spaces', 'value3', { systemTags: ['LLMWrite'] });

      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      // Should sanitize special characters to underscores (but preserve dashes)
      expect(toolNames).toContain('write_my-special_key_');
      expect(toolNames).toContain('write_normal_key');
      expect(toolNames).toContain('write_key_with_spaces');

      // Should not contain original unsanitized names
      expect(toolNames).not.toContain('write_my-special@key!');
      expect(toolNames).not.toContain('write_key with spaces');
    });

    test('should return empty object when no writable keys exist', () => {
      // Only add readonly keys
      cache.set_value('readonly1', 'value1', { systemTags: ['SystemPrompt'] });
      cache.set_value('readonly2', 'value2', { systemTags: ['SystemPrompt'] });

      const tools = cache.get_aisdk_tools();

      expect(Object.keys(tools)).toHaveLength(0);
    });

    test('should include proper tool descriptions and schemas', () => {
      cache.set_value('test_key', 'test_value', { systemTags: ['LLMWrite'] });

      const tools = cache.get_aisdk_tools();
      const tool = tools['write_test_key'];

      expect(tool).toBeDefined();
      expect(tool.description).toBe('Write a value to the STM key: test_key');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeInstanceOf(Function);
    });

    test('should execute tools correctly', async () => {
      cache.set_value('editable', 'old_value', { systemTags: ['LLMWrite'] });

      const tools = cache.get_aisdk_tools();
      const editableTool = tools['write_editable'];

      const result = await editableTool.execute({ value: 'new_value' });

      // Test the specialized success message for text type
      expect(result.result).toBe('Successfully wrote "new_value" to editable');
      expect(result.key).toBe('editable');
      expect(result.value).toBe('new_value');
      expect(cache.get_value('editable')).toBe('new_value');
    });
  });

  describe('executeToolCall', () => {
    test('should work with sanitized tool names', () => {
      cache.set_value('my-special@key!', 'original_value', { systemTags: ['LLMWrite'] });

      // Execute tool call with sanitized name
      const result = cache.executeToolCall('write_my-special_key_', 'new_value');

      expect(result).not.toBeNull();
      expect(result!.result).toContain('Successfully wrote "new_value" to my-special@key!');
      expect(result!.key).toBe('my-special@key!'); // Should return original key
      expect(result!.value).toBe('new_value');

      // Value should be updated in STM
      expect(cache.get_value('my-special@key!')).toBe('new_value');
    });

    test('should return null for invalid tool names', () => {
      const result1 = cache.executeToolCall('invalid_tool', 'value');
      const result2 = cache.executeToolCall('write_nonexistent_key', 'value');
      const result3 = cache.executeToolCall('not_write_tool', 'value');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });

    test('should not work with readonly keys', () => {
      cache.set_value('readonly_key', 'original', { systemTags: ['SystemPrompt'] });

      const result = cache.executeToolCall('write_readonly_key', 'new_value');

      expect(result).toBeNull();
      expect(cache.get_value('readonly_key')).toBe('original'); // Should remain unchanged
    });

    test('should handle complex key sanitization edge cases', () => {
      // Test various special characters
      const testCases = [
        { original: 'key@#$%^&*()', sanitized: 'key_________' }, // 9 special chars = 9 underscores
        { original: 'key-with-dashes', sanitized: 'key-with-dashes' },
        { original: 'key_with_underscores', sanitized: 'key_with_underscores' },
        { original: '123numeric', sanitized: '123numeric' },
        { original: 'MixedCASE', sanitized: 'MixedCASE' },
        { original: 'unicode-café', sanitized: 'unicode-caf_' }
      ];

      testCases.forEach(({ original, sanitized }) => {
        cache.set_value(original, 'test_value', { systemTags: ['LLMWrite'] });

        const result = cache.executeToolCall(`write_${sanitized}`, 'updated_value');

        expect(result).not.toBeNull();
        expect(result!.key).toBe(original);
        expect(cache.get_value(original)).toBe('updated_value');

        // Clean up
        cache.delete(original);
      });
    });

    test('should handle non-string values', () => {
      cache.set_value('test_key', 'original', { systemTags: ['LLMWrite'] });

      // Test with number
      const result1 = cache.executeToolCall('write_test_key', 123);
      expect(result1).not.toBeNull();
      expect(result1!.value).toBe(123);
      expect(cache.get_value('test_key')).toBe(123);

      // Test with object
      const testObject = { nested: 'value' };
      const result2 = cache.executeToolCall('write_test_key', testObject);
      expect(result2).not.toBeNull();
      expect(result2!.value).toEqual(testObject);
      expect(cache.get_value('test_key')).toEqual(testObject);
    });

    test('should work with keys that have attributes', () => {
      cache.set_value('special_key', 'original', {
        systemTags: ['SystemPrompt', 'LLMWrite'],
        contentTags: ['important']
      });

      const result = cache.executeToolCall('write_special_key', 'updated');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('special_key');
      expect(cache.get_value('special_key')).toBe('updated');

      // Attributes should be preserved
      const attributes = cache.get_attributes('special_key');
      expect(attributes).toBeDefined();
      expect(attributes!.systemTags).toContain('SystemPrompt');
    });
  });

  describe('Key Sanitization', () => {
    test('should consistently sanitize keys across methods', () => {
      const originalKey = 'test@key#with$special%chars!';
      cache.set_value(originalKey, 'test_value', { systemTags: ['LLMWrite'] });

      // Check tool generation
      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);
      const expectedToolName = 'write_test_key_with_special_chars_';

      expect(toolNames).toContain(expectedToolName);

      // Check executeToolCall works with same sanitization
      const result = cache.executeToolCall(expectedToolName, 'new_value');

      expect(result).not.toBeNull();
      expect(result!.key).toBe(originalKey);
      expect(cache.get_value(originalKey)).toBe('new_value');
    });

    test('should handle edge case sanitization patterns', () => {
      const edgeCases = [
        'key___multiple___underscores',
        'key---multiple---dashes',
        'key...dots...everywhere',
        'key   spaces   everywhere',
        'key\t\n\r\fwhitespace',
        '1234567890',
        'ALLCAPS',
        'mixedCASE123',
        ''
      ];

      edgeCases.forEach((key, index) => {
        if (key) { // Skip empty string
          cache.set_value(key, `value_${index}`, { systemTags: ['LLMWrite'] });

          const tools = cache.get_aisdk_tools();
          const toolNames = Object.keys(tools);

          // Should have at least one tool for this key
          const matchingTools = toolNames.filter(name => {
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
            return name === `write_${sanitizedKey}`;
          });

          expect(matchingTools).toHaveLength(1);

          // Clean up
          cache.delete(key);
        }
      });
    });
  });

  describe('Integration with System Prompt', () => {
    test('should include tool information in system prompt for writable keys', () => {
      cache.set_value('writable_key', 'writable_value', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('readonly_key', 'readonly_value', { systemTags: ['SystemPrompt'] });
      cache.set_value('hidden_key', 'hidden_value', { systemTags: ['LLMWrite'] });

      const prompt = cache.get_system_prompt();

      // Should mention tool for writable key
      expect(prompt).toContain('writable_key: writable_value. You can rewrite "writable_key" by using the write_writable_key tool');

      // Should not mention tool for readonly key
      expect(prompt).toContain('readonly_key: readonly_value');
      expect(prompt).not.toContain('write_readonly_key tool');

      // Should not include hidden key at all (no SystemPrompt tag)
      expect(prompt).not.toContain('hidden_key');
      expect(prompt).not.toContain('hidden_value');
    });

    test('should handle sanitized tool names in system prompt', () => {
      cache.set_value('special@key!', 'test_value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const prompt = cache.get_system_prompt();

      // Should reference the sanitized tool name in the prompt
      expect(prompt).toContain('special@key!: test_value. You can rewrite "special@key!" by using the write_special_key_ tool');
    });
  });
});
