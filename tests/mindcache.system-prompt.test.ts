import { MindCache } from 'mindcache';

describe('MindCache System Prompt Generation', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('get_system_prompt()', () => {
    test('should generate system prompt with readonly and writable keys', () => {
      // SystemPrompt + LLMWrite = writable and visible
      cache.set_value('user_name', 'Alice', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      // SystemPrompt only = readonly and visible
      cache.set_value('config', 'production', { systemTags: ['SystemPrompt'] });
      // LLMWrite only = writable but not in system prompt
      cache.set_value('hidden', 'secret', { systemTags: ['LLMWrite'] });
      // SystemPrompt + LLMWrite = writable and visible
      cache.set_value('notes', 'Important info', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      // Should include writable keys with tool mention
      expect(systemPrompt).toContain('user_name: Alice. You can rewrite "user_name" by using the write_user_name tool');
      expect(systemPrompt).toContain('notes: Important info. You can rewrite "notes" by using the write_notes tool');

      // Should include readonly keys without tool mention
      expect(systemPrompt).toContain('config: production');
      expect(systemPrompt).not.toContain('write_config tool');

      // Should not include hidden keys (no SystemPrompt tag)
      expect(systemPrompt).not.toContain('hidden');
      expect(systemPrompt).not.toContain('secret');

      // Should include system keys
      expect(systemPrompt).toMatch(/\$date: \d{4}-\d{2}-\d{2}/);
      expect(systemPrompt).toMatch(/\$time: \d{2}:\d{2}:\d{2}/);
    });

    test('should include LLMRead keys in system prompt like SystemPrompt', () => {
      // LLMRead = visible in system prompt (readonly)
      cache.set_value('llm_readable', 'readable_value', { systemTags: ['LLMRead'] });
      // LLMRead + LLMWrite = visible and writable
      cache.set_value('llm_read_write', 'read_write_value', { systemTags: ['LLMRead', 'LLMWrite'] });
      // Only LLMWrite = NOT in system prompt but writable
      cache.set_value('only_writable', 'write_only_value', { systemTags: ['LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      // LLMRead keys should be visible in system prompt
      expect(systemPrompt).toContain('llm_readable: readable_value');
      expect(systemPrompt).not.toContain('write_llm_readable tool'); // No LLMWrite = no tool

      // LLMRead + LLMWrite should have tool mention
      expect(systemPrompt).toContain('llm_read_write: read_write_value. You can rewrite "llm_read_write" by using the write_llm_read_write tool');

      // Only LLMWrite should NOT be in system prompt
      expect(systemPrompt).not.toContain('only_writable');
      expect(systemPrompt).not.toContain('write_only_value');
    });

    test('should treat LLMRead and SystemPrompt equivalently for visibility', () => {
      cache.set_value('with_system_prompt', 'value1', { systemTags: ['SystemPrompt'] });
      cache.set_value('with_llm_read', 'value2', { systemTags: ['LLMRead'] });
      cache.set_value('with_both', 'value3', { systemTags: ['SystemPrompt', 'LLMRead'] });
      cache.set_value('with_neither', 'value4', { systemTags: [] });

      const systemPrompt = cache.get_system_prompt();

      // All visible keys should appear
      expect(systemPrompt).toContain('with_system_prompt: value1');
      expect(systemPrompt).toContain('with_llm_read: value2');
      expect(systemPrompt).toContain('with_both: value3');

      // Key with no visibility tags should not appear
      expect(systemPrompt).not.toContain('with_neither');
      expect(systemPrompt).not.toContain('value4');
    });

    test('should process templates in system prompt', () => {
      cache.set_value('name', 'Bob', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('greeting', 'Hello {{name}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });
      cache.set_value('message', 'Welcome {{name}} to our system!', { systemTags: ['SystemPrompt', 'LLMWrite', 'ApplyTemplate'] });

      const systemPrompt = cache.get_system_prompt();

      // Templates should be processed
      expect(systemPrompt).toContain('greeting: Hello Bob!');
      expect(systemPrompt).toContain('message: Welcome Bob to our system!. You can rewrite "message" by using the write_message tool');
      expect(systemPrompt).toContain('name: Bob. You can rewrite "name" by using the write_name tool');
    });

    test('should handle nested template processing', () => {
      cache.set_value('user', 'Alice', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('greeting', 'Hello {{user}}!', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });
      cache.set_value('full_message', '{{greeting}} Welcome to the system.', { systemTags: ['SystemPrompt', 'ApplyTemplate'] });

      const systemPrompt = cache.get_system_prompt();

      // Nested templates should be processed
      expect(systemPrompt).toContain('full_message: Hello Alice! Welcome to the system.');
      expect(systemPrompt).toContain('greeting: Hello Alice!');
      expect(systemPrompt).toContain('user: Alice. You can rewrite "user" by using the write_user tool');
    });

    test('should return only system keys when no visible keys exist', () => {
      cache.set_value('hidden1', 'value1', { systemTags: [] });
      cache.set_value('hidden2', 'value2', { systemTags: ['LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      // Should only contain system keys
      expect(systemPrompt).toMatch(/^\$date: \d{4}-\d{2}-\d{2}\n\$time: \d{2}:\d{2}:\d{2}$/);
      expect(systemPrompt).not.toContain('hidden1');
      expect(systemPrompt).not.toContain('hidden2');
    });

    test('should handle mixed readonly and writable keys correctly', () => {
      cache.set_value('readonly_config', 'prod', { systemTags: ['SystemPrompt'] });
      cache.set_value('writable_setting', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();
      const lines = systemPrompt.split('\n');

      // Find the lines for our keys
      const readonlyLine = lines.find(line => line.startsWith('readonly_config:'));
      const writableLine = lines.find(line => line.startsWith('writable_setting:'));

      expect(readonlyLine).toBe('readonly_config: prod');
      expect(writableLine).toBe('writable_setting: value. You can rewrite "writable_setting" by using the write_writable_setting tool. This tool DOES NOT append — start your response with the old value (value)');
    });

    test('should handle empty values correctly', () => {
      cache.set_value('empty_readonly', '', { systemTags: ['SystemPrompt'] });
      cache.set_value('empty_writable', '', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      expect(systemPrompt).toContain('empty_readonly: ');
      expect(systemPrompt).toContain('empty_writable: . You can rewrite "empty_writable" by using the write_empty_writable tool');
    });

    test('should handle complex object values', () => {
      cache.set_value('user_data', { name: 'Alice', age: 30 }, { systemTags: ['SystemPrompt'] });
      cache.set_value('settings', { theme: 'dark', notifications: true }, { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      expect(systemPrompt).toContain('user_data: {"name":"Alice","age":30}');
      expect(systemPrompt).toContain('settings: {"theme":"dark","notifications":true}. You can rewrite "settings" by using the write_settings tool');
    });

    test('should respect visibility settings', () => {
      cache.set_value('public_readonly', 'visible', { systemTags: ['SystemPrompt'] });
      cache.set_value('public_writable', 'visible', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('private_readonly', 'hidden', { systemTags: [] });
      cache.set_value('private_writable', 'hidden', { systemTags: ['LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();

      // Only visible keys should appear (those with SystemPrompt tag)
      expect(systemPrompt).toContain('public_readonly: visible');
      expect(systemPrompt).toContain('public_writable: visible. You can rewrite "public_writable" by using the write_public_writable tool');

      // Hidden keys should not appear
      expect(systemPrompt).not.toContain('private_readonly');
      expect(systemPrompt).not.toContain('private_writable');
      expect(systemPrompt).not.toContain('hidden');
    });

    test('should handle system keys consistently', () => {
      // Set some regular keys
      cache.set_value('regular_key', 'value', { systemTags: ['SystemPrompt', 'LLMWrite'] });

      const systemPrompt = cache.get_system_prompt();
      const lines = systemPrompt.split('\n');

      // System keys should always be at the end
      const dateLineIndex = lines.findIndex(line => line.startsWith('$date:'));
      const timeLineIndex = lines.findIndex(line => line.startsWith('$time:'));

      expect(dateLineIndex).toBeGreaterThan(-1);
      expect(timeLineIndex).toBeGreaterThan(-1);
      expect(timeLineIndex).toBe(dateLineIndex + 1); // time should be right after date

      // System keys should be readonly format (no tool mention)
      expect(lines[dateLineIndex]).toMatch(/^\$date: \d{4}-\d{2}-\d{2}$/);
      expect(lines[timeLineIndex]).toMatch(/^\$time: \d{2}:\d{2}:\d{2}$/);
    });

    test('should handle template with system keys', () => {
      cache.set_value('today_message', 'Today is {{$date}} at {{$time}}', {
        systemTags: ['SystemPrompt', 'ApplyTemplate']
      });

      const systemPrompt = cache.get_system_prompt();

      // Template should process system keys
      expect(systemPrompt).toMatch(/today_message: Today is \d{4}-\d{2}-\d{2} at \d{2}:\d{2}:\d{2}/);

      // Regular system keys should still appear
      expect(systemPrompt).toMatch(/\$date: \d{4}-\d{2}-\d{2}/);
      expect(systemPrompt).toMatch(/\$time: \d{2}:\d{2}:\d{2}/);
    });

    test('should generate consistent output format', () => {
      cache.set_value('key1', 'value1', { systemTags: ['SystemPrompt', 'LLMWrite'] });
      cache.set_value('key2', 'value2', { systemTags: ['SystemPrompt'] });

      const systemPrompt = cache.get_system_prompt();
      const lines = systemPrompt.split('\n');

      // Each line should be properly formatted
      lines.forEach(line => {
        expect(line).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*: .+/); // key: value format
      });

      // Should be newline-separated
      expect(lines.length).toBeGreaterThan(1);
    });
  });
});
