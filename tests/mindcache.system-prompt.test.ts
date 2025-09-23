import { MindCache } from '../src/index';

describe('MindCache System Prompt Generation', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('get_system_prompt()', () => {
    test('should generate system prompt with readonly and writable keys', () => {
      cache.set_value('user_name', 'Alice', { readonly: false, visible: true });
      cache.set_value('config', 'production', { readonly: true, visible: true });
      cache.set_value('hidden', 'secret', { readonly: false, visible: false });
      cache.set_value('notes', 'Important info', { readonly: false, visible: true });

      const systemPrompt = cache.get_system_prompt();

      // Should include writable keys with tool mention
      expect(systemPrompt).toContain('user_name: Alice. You can update user_name by using the write_user_name tool');
      expect(systemPrompt).toContain('notes: Important info. You can update notes by using the write_notes tool');
      
      // Should include readonly keys without tool mention
      expect(systemPrompt).toContain('config: production');
      expect(systemPrompt).not.toContain('write_config tool');
      
      // Should not include hidden keys
      expect(systemPrompt).not.toContain('hidden');
      expect(systemPrompt).not.toContain('secret');
      
      // Should include system keys
      expect(systemPrompt).toMatch(/\$date: \d{4}-\d{2}-\d{2}/);
      expect(systemPrompt).toMatch(/\$time: \d{2}:\d{2}:\d{2}/);
    });

    test('should process templates in system prompt', () => {
      cache.set_value('name', 'Bob', { readonly: false, visible: true });
      cache.set_value('greeting', 'Hello {name}!', { readonly: true, visible: true, template: true });
      cache.set_value('message', 'Welcome {name} to our system!', { readonly: false, visible: true, template: true });

      const systemPrompt = cache.get_system_prompt();

      // Templates should be processed
      expect(systemPrompt).toContain('greeting: Hello Bob!');
      expect(systemPrompt).toContain('message: Welcome Bob to our system!. You can update message by using the write_message tool');
      expect(systemPrompt).toContain('name: Bob. You can update name by using the write_name tool');
    });

    test('should handle nested template processing', () => {
      cache.set_value('user', 'Alice', { readonly: false, visible: true });
      cache.set_value('greeting', 'Hello {user}!', { readonly: true, visible: true, template: true });
      cache.set_value('full_message', '{greeting} Welcome to the system.', { readonly: true, visible: true, template: true });

      const systemPrompt = cache.get_system_prompt();

      // Nested templates should be processed
      expect(systemPrompt).toContain('full_message: Hello Alice! Welcome to the system.');
      expect(systemPrompt).toContain('greeting: Hello Alice!');
      expect(systemPrompt).toContain('user: Alice. You can update user by using the write_user tool');
    });

    test('should return only system keys when no visible keys exist', () => {
      cache.set_value('hidden1', 'value1', { visible: false });
      cache.set_value('hidden2', 'value2', { visible: false });

      const systemPrompt = cache.get_system_prompt();

      // Should only contain system keys
      expect(systemPrompt).toMatch(/^\$date: \d{4}-\d{2}-\d{2}\n\$time: \d{2}:\d{2}:\d{2}$/);
      expect(systemPrompt).not.toContain('hidden1');
      expect(systemPrompt).not.toContain('hidden2');
    });

    test('should handle mixed readonly and writable keys correctly', () => {
      cache.set_value('readonly_config', 'prod', { readonly: true, visible: true });
      cache.set_value('writable_setting', 'value', { readonly: false, visible: true });

      const systemPrompt = cache.get_system_prompt();
      const lines = systemPrompt.split('\n');

      // Find the lines for our keys
      const readonlyLine = lines.find(line => line.startsWith('readonly_config:'));
      const writableLine = lines.find(line => line.startsWith('writable_setting:'));

      expect(readonlyLine).toBe('readonly_config: prod');
      expect(writableLine).toBe('writable_setting: value. You can update writable_setting by using the write_writable_setting tool');
    });

    test('should handle empty values correctly', () => {
      cache.set_value('empty_readonly', '', { readonly: true, visible: true });
      cache.set_value('empty_writable', '', { readonly: false, visible: true });

      const systemPrompt = cache.get_system_prompt();

      expect(systemPrompt).toContain('empty_readonly: ');
      expect(systemPrompt).toContain('empty_writable: . You can update empty_writable by using the write_empty_writable tool');
    });

    test('should handle complex object values', () => {
      cache.set_value('user_data', { name: 'Alice', age: 30 }, { readonly: true, visible: true });
      cache.set_value('settings', { theme: 'dark', notifications: true }, { readonly: false, visible: true });

      const systemPrompt = cache.get_system_prompt();

      expect(systemPrompt).toContain('user_data: {"name":"Alice","age":30}');
      expect(systemPrompt).toContain('settings: {"theme":"dark","notifications":true}. You can update settings by using the write_settings tool');
    });

    test('should respect visibility settings', () => {
      cache.set_value('public_readonly', 'visible', { readonly: true, visible: true });
      cache.set_value('public_writable', 'visible', { readonly: false, visible: true });
      cache.set_value('private_readonly', 'hidden', { readonly: true, visible: false });
      cache.set_value('private_writable', 'hidden', { readonly: false, visible: false });

      const systemPrompt = cache.get_system_prompt();

      // Only visible keys should appear
      expect(systemPrompt).toContain('public_readonly: visible');
      expect(systemPrompt).toContain('public_writable: visible. You can update public_writable by using the write_public_writable tool');
      
      // Hidden keys should not appear
      expect(systemPrompt).not.toContain('private_readonly');
      expect(systemPrompt).not.toContain('private_writable');
      expect(systemPrompt).not.toContain('hidden');
    });

    test('should handle system keys consistently', () => {
      // Set some regular keys
      cache.set_value('regular_key', 'value', { readonly: false, visible: true });

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
      cache.set_value('today_message', 'Today is {$date} at {$time}', { 
        readonly: true, 
        visible: true, 
        template: true 
      });

      const systemPrompt = cache.get_system_prompt();

      // Template should process system keys
      expect(systemPrompt).toMatch(/today_message: Today is \d{4}-\d{2}-\d{2} at \d{2}:\d{2}:\d{2}/);
      
      // Regular system keys should still appear
      expect(systemPrompt).toMatch(/\$date: \d{4}-\d{2}-\d{2}/);
      expect(systemPrompt).toMatch(/\$time: \d{2}:\d{2}:\d{2}/);
    });

    test('should generate consistent output format', () => {
      cache.set_value('key1', 'value1', { readonly: false, visible: true });
      cache.set_value('key2', 'value2', { readonly: true, visible: true });

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
