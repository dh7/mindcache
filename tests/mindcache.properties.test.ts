import { MindCache } from 'mindcache';

describe('MindCache Key Properties', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('Basic Property Management', () => {
    test('should set value with default attributes', () => {
      cache.set_value('test_key', 'test_value');
      const attributes = cache.get_attributes('test_key');

      // Check key properties - new format uses systemTags
      expect(attributes?.type).toBe('text');
      expect(attributes?.contentTags).toEqual([]);
      expect(attributes?.systemTags).toContain('SystemPrompt'); // visible by default
      expect(attributes?.systemTags).toContain('LLMWrite'); // writable by default
    });

    test('should set value with custom attributes', () => {
      const customAttributes = {
        systemTags: ['protected'] as ('SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'protected' | 'ApplyTemplate')[]
      };

      cache.set_value('custom_key', 'custom_value', customAttributes);
      const attributes = cache.get_attributes('custom_key');

      expect(attributes?.systemTags).toContain('protected');
      expect(attributes?.systemTags).not.toContain('SystemPrompt');
      expect(attributes?.systemTags).not.toContain('LLMWrite');
    });

    test('should set partial attributes', () => {
      cache.set_value('partial_key', 'partial_value', { systemTags: [] });
      const attributes = cache.get_attributes('partial_key');

      expect(attributes?.systemTags).toEqual([]);
      expect(attributes?.type).toBe('text');
    });

    test('should update attributes of existing key', () => {
      cache.set_value('existing_key', 'value');
      const result = cache.set_attributes('existing_key', { systemTags: [] });

      expect(result).toBe(true);
      const attributes = cache.get_attributes('existing_key');
      expect(attributes?.systemTags).toEqual([]);
    });

    test('should return false when setting attributes for non-existent key', () => {
      const result = cache.set_attributes('non_existent', { systemTags: ['protected'] });
      expect(result).toBe(false);
    });

    test('should return undefined attributes for non-existent key', () => {
      const attributes = cache.get_attributes('non_existent');
      expect(attributes).toBeUndefined();
    });

    test('should return protected attributes for $date and $time', () => {
      const dateAttrs = cache.get_attributes('$date');
      const timeAttrs = cache.get_attributes('$time');

      // Check key properties
      expect(dateAttrs?.type).toBe('text');
      expect(dateAttrs?.systemTags).toContain('SystemPrompt');
      expect(dateAttrs?.systemTags).toContain('protected');

      expect(timeAttrs?.type).toBe('text');
      expect(timeAttrs?.systemTags).toContain('SystemPrompt');
      expect(timeAttrs?.systemTags).toContain('protected');
    });

    test('should not allow setting attributes for protected system keys', () => {
      const dateResult = cache.set_attributes('$date', { systemTags: [] });
      const timeResult = cache.set_attributes('$time', { systemTags: [] });

      expect(dateResult).toBe(false);
      expect(timeResult).toBe(false);
    });
  });

  describe('LLMWrite Property (Writable Keys)', () => {
    test('non-writable keys should not appear in AI SDK tools', () => {
      cache.set_value('writable_key', 'value1', { systemTags: ['LLMWrite'] });
      cache.set_value('readonly_key', 'value2', { systemTags: ['SystemPrompt'] });

      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).toContain('write_writable_key');
      expect(toolNames).not.toContain('write_readonly_key');
    });

    test('protected system keys should not appear in AI SDK tools', () => {
      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);

      expect(toolNames).not.toContain('write_$date');
      expect(toolNames).not.toContain('write_$time');
    });

    test('should not allow setting protected system keys via set_value', () => {
      const originalDate = cache.get_value('$date');

      cache.set_value('$date', '2020-01-01');

      // Should still return the actual current date, not the set value
      expect(cache.get_value('$date')).not.toBe('2020-01-01');
      expect(cache.get_value('$date')).toBe(originalDate);
    });

    test('AI SDK tools should work correctly with non-writable keys', async () => {
      cache.set_value('editable', 'old_value', { systemTags: ['LLMWrite'] });
      cache.set_value('locked', 'locked_value', { systemTags: ['SystemPrompt'] });

      const tools = cache.get_aisdk_tools();

      // Should be able to execute tool for editable key
      const editableTool = tools['write_editable'];
      expect(editableTool).toBeDefined();

      const result = await editableTool.execute({ value: 'new_value' });
      expect(result.result).toContain('Successfully wrote "new_value" to editable');
      expect(cache.get_value('editable')).toBe('new_value');

      // Should not have tool for readonly key
      expect(tools['write_locked']).toBeUndefined();
    });

  });

  describe('SystemPrompt and LLMRead Properties (Visible Keys)', () => {
    beforeEach(() => {
      cache.set_value('visible_key', 'visible_value', { systemTags: ['SystemPrompt'] });
      cache.set_value('llm_read_key', 'llm_read_value', { systemTags: ['LLMRead'] });
      cache.set_value('invisible_key', 'invisible_value', { systemTags: [] });
    });

    test('invisible keys should not appear in injectSTM', () => {
      const template = 'Visible: {{visible_key}}, LLMRead: {{llm_read_key}}, Invisible: {{invisible_key}}';
      const result = cache.injectSTM(template);

      expect(result).toBe('Visible: visible_value, LLMRead: llm_read_value, Invisible: ');
    });

    test('invisible keys should not appear in getSTM', () => {
      const stmString = cache.getSTM();

      expect(stmString).toContain('visible_key: visible_value');
      expect(stmString).toContain('llm_read_key: llm_read_value');
      expect(stmString).not.toContain('invisible_key');
      expect(stmString).not.toContain('invisible_value');
    });

    test('LLMRead keys should appear in system prompt like SystemPrompt keys', () => {
      cache.set_value('system_prompt_key', 'value1', { systemTags: ['SystemPrompt'] });
      cache.set_value('llm_read_only_key', 'value2', { systemTags: ['LLMRead'] });
      cache.set_value('both_tags_key', 'value3', { systemTags: ['SystemPrompt', 'LLMRead'] });

      const stmString = cache.getSTM();

      expect(stmString).toContain('system_prompt_key: value1');
      expect(stmString).toContain('llm_read_only_key: value2');
      expect(stmString).toContain('both_tags_key: value3');
    });

    test('protected system keys should always be visible in injectSTM', () => {
      const template = 'Date: {{$date}}, Time: {{$time}}';
      const result = cache.injectSTM(template);

      expect(result).toContain('Date: ');
      expect(result).toContain('Time: ');
      expect(result).not.toBe('Date: , Time: ');
    });

    test('protected system keys should always appear in getSTM', () => {
      const stmString = cache.getSTM();

      expect(stmString).toContain('$date:');
      expect(stmString).toContain('$time:');
    });

    test('invisible keys should still be retrievable via get_value', () => {
      const value = cache.get_value('invisible_key');
      expect(value).toBe('invisible_value');
    });

    test('keys() method should return all keys regardless of visibility', () => {
      const keys = cache.keys();

      expect(keys).toContain('visible_key');
      expect(keys).toContain('invisible_key');
      expect(keys).toContain('$date');
      expect(keys).toContain('$time');
    });

    test('getAll() method should return all values regardless of visibility', () => {
      const all = cache.getAll();

      expect(all.visible_key).toBe('visible_value');
      expect(all.invisible_key).toBe('invisible_value');
      expect(all.$date).toBeDefined();
      expect(all.$time).toBeDefined();
    });
  });

  describe('ApplyTemplate Property (Template Keys)', () => {
    beforeEach(() => {
      cache.set_value('username', 'john_doe');
      cache.set_value('greeting_template', 'Hello {{username}}! Today is {{$date}}', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });
      cache.set_value('plain_text', 'Just plain text', { systemTags: ['SystemPrompt'] });
    });

    test('template keys should process injectSTM when retrieved', () => {
      const result = cache.get_value('greeting_template');

      expect(result).toContain('Hello john_doe!');
      expect(result).toContain('Today is');
      expect(result).not.toContain('{{username}}');
      expect(result).not.toContain('{{$date}}');
    });

    test('non-template keys should return raw value', () => {
      const result = cache.get_value('plain_text');
      expect(result).toBe('Just plain text');
    });

    test('template processing should work with invisible keys in template', () => {
      cache.set_value('secret', 'hidden_value', { systemTags: [] });
      cache.set_value('template_with_secret', 'Secret: {{secret}}', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      const result = cache.get_value('template_with_secret');
      // Template processing (internal) can access invisible keys
      expect(result).toBe('Secret: hidden_value');
    });

    test('getSTM should show processed template values', () => {
      const stmString = cache.getSTM();

      expect(stmString).toContain('greeting_template: Hello john_doe!');
      expect(stmString).not.toContain('{{username}}');
    });

    test('template with missing keys should leave placeholders empty', () => {
      cache.set_value('incomplete_template', 'Hello {{missing_key}}!', { systemTags: ['ApplyTemplate'] });

      const result = cache.get_value('incomplete_template');
      expect(result).toBe('Hello !');
    });

    test('nested template processing should work', () => {
      cache.set_value('name', 'Alice');
      cache.set_value('title', 'Dr. {{name}}', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });
      cache.set_value('full_greeting', 'Welcome, {{title}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      const result = cache.get_value('full_greeting');
      expect(result).toBe('Welcome, Dr. Alice!');
    });

    test('deprecated get() method should work with template keys', () => {
      const result = cache.get('greeting_template');

      expect(result).toContain('Hello john_doe!');
      expect(result).toContain('Today is');
    });
  });

  describe('Default Property', () => {
    test('clear should remove all values', () => {
      cache.set_value('with_value', 'current_value');
      cache.set_value('another_value', 'another_value');

      expect(cache.get_value('with_value')).toBe('current_value');
      expect(cache.get_value('another_value')).toBe('another_value');

      cache.clear();

      expect(cache.get_value('with_value')).toBeUndefined();
      expect(cache.get_value('another_value')).toBeUndefined();
    });

    test('clear should remove all keys', () => {
      cache.set_value('temp_key', 'temp_value');

      expect(cache.has('temp_key')).toBe(true);

      cache.clear();

      expect(cache.has('temp_key')).toBe(false);
      expect(cache.get_value('temp_key')).toBeUndefined();
    });
  });

  describe('Protected Property', () => {
    test('protected system keys should have protected tag', () => {
      const dateAttrs = cache.get_attributes('$date');
      const timeAttrs = cache.get_attributes('$time');

      expect(dateAttrs?.systemTags).toContain('protected');
      expect(timeAttrs?.systemTags).toContain('protected');
    });

    test('regular keys should not have protected tag by default', () => {
      cache.set_value('regular_key', 'value');
      const attributes = cache.get_attributes('regular_key');

      expect(attributes?.systemTags).not.toContain('protected');
    });

    test('can create custom protected keys with system access', () => {
      const systemCache = new MindCache({ accessLevel: 'system' });
      systemCache.set_value('custom_protected', 'protected_value');
      systemCache.systemAddTag('custom_protected', 'protected');
      const attributes = systemCache.get_attributes('custom_protected');

      expect(attributes?.systemTags).toContain('protected');
    });
  });

  describe('Integration Tests', () => {
    test('complex scenario with all properties', () => {
      // Set up a complex scenario
      cache.set_value('user_name', 'Alice', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });

      cache.set_value('api_secret', 'secret123', {
        systemTags: []
      });

      cache.set_value('welcome_msg', 'Welcome {{user_name}}! Date: {{$date}}', {
        systemTags: ['SystemPrompt', 'LLMWrite', 'ApplyTemplate']
      });

      // Test injectSTM (should not include invisible api_secret)
      const template = 'User: {{user_name}}, Secret: {{api_secret}}, Message: {{welcome_msg}}';
      const injected = cache.injectSTM(template);
      expect(injected).toContain('User: Alice');
      expect(injected).toContain('Secret: '); // Empty because invisible
      expect(injected).toContain('Message: Welcome Alice!');

      // Test getSTM (should not show invisible keys)
      const stmString = cache.getSTM();
      expect(stmString).toContain('user_name: Alice');
      expect(stmString).toContain('welcome_msg: Welcome Alice!');
      expect(stmString).not.toContain('api_secret');

      // Test AI tools (should exclude non-writable keys)
      const tools = cache.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_user_name');
      expect(Object.keys(tools)).toContain('write_welcome_msg');
      expect(Object.keys(tools)).not.toContain('write_api_secret');

      // Test clear removes all keys
      cache.clear();
      expect(cache.get_value('user_name')).toBeUndefined();
      expect(cache.get_value('welcome_msg')).toBeUndefined();
      expect(cache.get_value('api_secret')).toBeUndefined();
    });

    test('backward compatibility with old methods', () => {
      // Set using old method
      cache.set('old_key', 'old_value');

      // Should have default attributes
      const attributes = cache.get_attributes('old_key');
      expect(attributes?.type).toBe('text');
      expect(attributes?.contentTags).toEqual([]);
      expect(attributes?.systemTags).toContain('SystemPrompt');
      expect(attributes?.systemTags).toContain('LLMWrite');

      // Old get should work
      expect(cache.get('old_key')).toBe('old_value');

      // Should appear in tools and STM
      const tools = cache.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_old_key');

      const stmString = cache.getSTM();
      expect(stmString).toContain('old_key: old_value');
    });

    test('protected keys are not included in tools', () => {
      // Create a protected key that tries to be writable
      const systemCache = new MindCache({ accessLevel: 'system' });
      systemCache.set_value('protected_tracker', 'tracking_value', {
        systemTags: ['SystemPrompt', 'LLMWrite']
      });
      systemCache.systemAddTag('protected_tracker', 'protected');

      const attributes = systemCache.get_attributes('protected_tracker');
      expect(attributes?.systemTags).toContain('protected');

      // Protected keys should still appear in AI tools if they have LLMWrite
      // (protection is about deletion, not writing)
      const tools = systemCache.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_protected_tracker');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string values with templates', () => {
      cache.set_value('empty_template', '', { systemTags: ['ApplyTemplate'] });
      const result = cache.get_value('empty_template');
      expect(result).toBe('');
    });

    test('should handle null/undefined values with templates', () => {
      cache.set_value('null_template', null, { systemTags: ['ApplyTemplate'] });
      cache.set_value('undefined_template', undefined, { systemTags: ['ApplyTemplate'] });

      // Should not throw errors
      expect(() => cache.get_value('null_template')).not.toThrow();
      expect(() => cache.get_value('undefined_template')).not.toThrow();
    });

    test('should handle circular template references gracefully', () => {
      cache.set_value('template_a', 'A: {{template_b}}', { systemTags: ['ApplyTemplate'] });
      cache.set_value('template_b', 'B: {{template_a}}', { systemTags: ['ApplyTemplate'] });

      // Should not cause infinite recursion
      expect(() => cache.get_value('template_a')).not.toThrow();
    });

    test('should handle special characters in template values', () => {
      cache.set_value('special_chars', 'Special: $@#%^&*()');
      cache.set_value('template_special', 'Value: {{special_chars}}', { systemTags: ['ApplyTemplate'] });

      const result = cache.get_value('template_special');
      expect(result).toBe('Value: Special: $@#%^&*()');
    });
  });
});
