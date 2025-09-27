import { MindCache } from '../src/index';

describe('MindCache Key Properties', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('Basic Property Management', () => {
    test('should set value with default attributes', () => {
      cache.set_value('test_key', 'test_value');
      const attributes = cache.get_attributes('test_key');
      
      expect(attributes).toEqual({
        readonly: false,
        visible: true,
        default: '',
        hardcoded: false,
        template: false,
        type: 'text' as const
      });
    });

    test('should set value with custom attributes', () => {
      const customAttributes = {
        readonly: true,
        visible: false,
        default: 'default_value',
        hardcoded: true,
        template: true // This will be forced to false because hardcoded=true
      };
      
      cache.set_value('custom_key', 'custom_value', customAttributes);
      const attributes = cache.get_attributes('custom_key');
      
      // Hardcoded keys force readonly=true and template=false
      const expectedAttributes = {
        readonly: true,
        visible: false,
        default: 'default_value',
        hardcoded: true,
        template: false, // Hardcoded keys cannot be templates
        type: 'text' as const
      };
      
      expect(attributes).toEqual(expectedAttributes);
    });

    test('should set partial attributes', () => {
      cache.set_value('partial_key', 'partial_value', { readonly: true, visible: false });
      const attributes = cache.get_attributes('partial_key');
      
      expect(attributes).toEqual({
        readonly: true,
        visible: false,
        default: '',
        hardcoded: false,
        template: false,
        type: 'text' as const
      });
    });

    test('should update attributes of existing key', () => {
      cache.set_value('existing_key', 'value');
      const result = cache.set_attributes('existing_key', { readonly: true, visible: false });
      
      expect(result).toBe(true);
      const attributes = cache.get_attributes('existing_key');
      expect(attributes?.readonly).toBe(true);
      expect(attributes?.visible).toBe(false);
    });

    test('should return false when setting attributes for non-existent key', () => {
      const result = cache.set_attributes('non_existent', { readonly: true });
      expect(result).toBe(false);
    });

    test('should return undefined attributes for non-existent key', () => {
      const attributes = cache.get_attributes('non_existent');
      expect(attributes).toBeUndefined();
    });

    test('should return hardcoded attributes for $date and $time', () => {
      const dateAttrs = cache.get_attributes('$date');
      const timeAttrs = cache.get_attributes('$time');
      
      expect(dateAttrs).toEqual({
        readonly: true,
        visible: true,
        default: '',
        hardcoded: true,
        template: false,
        type: 'text' as const
      });
      
      expect(timeAttrs).toEqual({
        readonly: true,
        visible: true,
        default: '',
        hardcoded: true,
        template: false,
        type: 'text' as const
      });
    });

    test('should not allow setting attributes for hardcoded system keys', () => {
      const dateResult = cache.set_attributes('$date', { readonly: false });
      const timeResult = cache.set_attributes('$time', { visible: false });
      
      expect(dateResult).toBe(false);
      expect(timeResult).toBe(false);
    });

    test('should not allow modifying hardcoded property via set_attributes', () => {
      cache.set_value('test_key', 'test_value', { hardcoded: false });
      
      // Verify initial hardcoded property
      const initialAttrs = cache.get_attributes('test_key');
      expect(initialAttrs?.hardcoded).toBe(false);
      
      // Try to modify hardcoded property
      const result = cache.set_attributes('test_key', { hardcoded: true, readonly: true });
      
      // Should return true (operation succeeded) but hardcoded property should remain unchanged
      expect(result).toBe(true);
      
      const finalAttrs = cache.get_attributes('test_key');
      expect(finalAttrs?.hardcoded).toBe(false); // Hardcoded property should not change
      expect(finalAttrs?.readonly).toBe(true); // Other properties should change
    });

    test('hardcoded keys should always be readonly', () => {
      cache.set_value('user_key', 'value', { hardcoded: true });
      
      const attributes = cache.get_attributes('user_key');
      expect(attributes?.hardcoded).toBe(true); // This should work for initial creation
      expect(attributes?.readonly).toBe(true); // Should automatically be readonly
      
      // But trying to modify it later should not work
      cache.set_attributes('user_key', { hardcoded: false });
      const updatedAttributes = cache.get_attributes('user_key');
      expect(updatedAttributes?.hardcoded).toBe(true); // Should remain true
      expect(updatedAttributes?.readonly).toBe(true); // Should remain readonly
    });

    test('hardcoded keys cannot be made non-readonly', () => {
      cache.set_value('hardcoded_key', 'value', { hardcoded: true, readonly: false });
      
      const attributes = cache.get_attributes('hardcoded_key');
      expect(attributes?.hardcoded).toBe(true);
      expect(attributes?.readonly).toBe(true); // Should be forced to true
      
      // Try to set readonly to false
      cache.set_attributes('hardcoded_key', { readonly: false });
      const updatedAttributes = cache.get_attributes('hardcoded_key');
      expect(updatedAttributes?.readonly).toBe(true); // Should remain true
    });

    test('hardcoded keys cannot be templates', () => {
      cache.set_value('hardcoded_key', 'value', { hardcoded: true, template: true });
      
      const attributes = cache.get_attributes('hardcoded_key');
      expect(attributes?.hardcoded).toBe(true);
      expect(attributes?.template).toBe(false); // Should be forced to false
      
      // Try to set template to true
      cache.set_attributes('hardcoded_key', { template: true });
      const updatedAttributes = cache.get_attributes('hardcoded_key');
      expect(updatedAttributes?.template).toBe(false); // Should remain false
    });
  });

  describe('Readonly Property', () => {
    test('readonly keys should not appear in AI SDK tools', () => {
      cache.set_value('writable_key', 'value1', { readonly: false });
      cache.set_value('readonly_key', 'value2', { readonly: true });
      
      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);
      
      expect(toolNames).toContain('write_writable_key');
      expect(toolNames).not.toContain('write_readonly_key');
    });

    test('hardcoded system keys should not appear in AI SDK tools', () => {
      const tools = cache.get_aisdk_tools();
      const toolNames = Object.keys(tools);
      
      expect(toolNames).not.toContain('write_$date');
      expect(toolNames).not.toContain('write_$time');
    });

    test('should not allow setting hardcoded system keys via set_value', () => {
      const originalDate = cache.get_value('$date');
      
      cache.set_value('$date', '2020-01-01');
      
      // Should still return the actual current date, not the set value
      expect(cache.get_value('$date')).not.toBe('2020-01-01');
      expect(cache.get_value('$date')).toBe(originalDate);
    });

    test('AI SDK tools should work correctly with readonly keys', async () => {
      cache.set_value('editable', 'old_value', { readonly: false });
      cache.set_value('locked', 'locked_value', { readonly: true });
      
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

  describe('Visible Property', () => {
    beforeEach(() => {
      cache.set_value('visible_key', 'visible_value', { visible: true });
      cache.set_value('invisible_key', 'invisible_value', { visible: false });
    });

    test('invisible keys should not appear in injectSTM', () => {
      const template = 'Visible: {visible_key}, Invisible: {invisible_key}';
      const result = cache.injectSTM(template);
      
      expect(result).toBe('Visible: visible_value, Invisible: ');
    });

    test('invisible keys should not appear in getSTM', () => {
      const stmString = cache.getSTM();
      
      expect(stmString).toContain('visible_key: visible_value');
      expect(stmString).not.toContain('invisible_key');
      expect(stmString).not.toContain('invisible_value');
    });

    test('hardcoded system keys should always be visible in injectSTM', () => {
      const template = 'Date: {$date}, Time: {$time}';
      const result = cache.injectSTM(template);
      
      expect(result).toContain('Date: ');
      expect(result).toContain('Time: ');
      expect(result).not.toBe('Date: , Time: ');
    });

    test('hardcoded system keys should always appear in getSTM', () => {
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

  describe('Template Property', () => {
    beforeEach(() => {
      cache.set_value('username', 'john_doe');
      cache.set_value('greeting_template', 'Hello {username}! Today is {$date}', { template: true });
      cache.set_value('plain_text', 'Just plain text', { template: false });
    });

    test('template keys should process injectSTM when retrieved', () => {
      const result = cache.get_value('greeting_template');
      
      expect(result).toContain('Hello john_doe!');
      expect(result).toContain('Today is');
      expect(result).not.toContain('{username}');
      expect(result).not.toContain('{$date}');
    });

    test('non-template keys should return raw value', () => {
      const result = cache.get_value('plain_text');
      expect(result).toBe('Just plain text');
    });

    test('template processing should work with invisible keys in template', () => {
      cache.set_value('secret', 'hidden_value', { visible: false });
      cache.set_value('template_with_secret', 'Secret: {secret}', { template: true });
      
      const result = cache.get_value('template_with_secret');
      // Template processing (internal) can access invisible keys
      expect(result).toBe('Secret: hidden_value');
    });

    test('getSTM should show processed template values', () => {
      const stmString = cache.getSTM();
      
      expect(stmString).toContain('greeting_template: Hello john_doe!');
      expect(stmString).not.toContain('{username}');
    });

    test('template with missing keys should leave placeholders empty', () => {
      cache.set_value('incomplete_template', 'Hello {missing_key}!', { template: true });
      
      const result = cache.get_value('incomplete_template');
      expect(result).toBe('Hello !');
    });

    test('nested template processing should work', () => {
      cache.set_value('name', 'Alice');
      cache.set_value('title', 'Dr. {name}', { template: true });
      cache.set_value('full_greeting', 'Welcome, {title}!', { template: true });
      
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
    test('clear should restore default values', () => {
      cache.set_value('with_default', 'current_value', { default: 'default_value' });
      cache.set_value('without_default', 'another_value', { default: '' });
      
      expect(cache.get_value('with_default')).toBe('current_value');
      expect(cache.get_value('without_default')).toBe('another_value');
      
      cache.clear();
      
      expect(cache.get_value('with_default')).toBe('default_value');
      expect(cache.get_value('without_default')).toBeUndefined();
    });

    test('clear should preserve attributes when restoring defaults', () => {
      const originalAttributes = {
        readonly: true,
        visible: false,
        default: 'default_val',
        hardcoded: false,
        template: true
      };
      
      cache.set_value('test_key', 'current_val', originalAttributes);
      cache.clear();
      
      const attributes = cache.get_attributes('test_key');
      expect(attributes).toEqual({...originalAttributes, type: 'text'});
      expect(cache.get_value('test_key')).toBe('default_val');
    });

    test('keys with empty default should be removed on clear', () => {
      cache.set_value('temp_key', 'temp_value', { default: '' });
      
      expect(cache.has('temp_key')).toBe(true);
      
      cache.clear();
      
      expect(cache.has('temp_key')).toBe(false);
      expect(cache.get_value('temp_key')).toBeUndefined();
    });

    test('multiple keys with defaults should all be restored', () => {
      cache.set_value('key1', 'value1', { default: 'default1' });
      cache.set_value('key2', 'value2', { default: 'default2' });
      cache.set_value('key3', 'value3', { default: '' });
      
      cache.clear();
      
      expect(cache.get_value('key1')).toBe('default1');
      expect(cache.get_value('key2')).toBe('default2');
      expect(cache.get_value('key3')).toBeUndefined();
    });
  });

  describe('Hardcoded Property', () => {
    test('hardcoded system keys should have hardcoded property set to true', () => {
      const dateAttrs = cache.get_attributes('$date');
      const timeAttrs = cache.get_attributes('$time');
      
      expect(dateAttrs?.hardcoded).toBe(true);
      expect(timeAttrs?.hardcoded).toBe(true);
    });

    test('regular keys should have hardcoded property set to false by default', () => {
      cache.set_value('regular_key', 'value');
      const attributes = cache.get_attributes('regular_key');
      
      expect(attributes?.hardcoded).toBe(false);
    });

    test('can create custom hardcoded keys', () => {
      cache.set_value('custom_hardcoded', 'hardcoded_value', { hardcoded: true });
      const attributes = cache.get_attributes('custom_hardcoded');
      
      expect(attributes?.hardcoded).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('complex scenario with all properties', () => {
      // Set up a complex scenario
      cache.set_value('user_name', 'Alice', { 
        readonly: false, 
        visible: true, 
        default: 'Guest', 
        hardcoded: false, 
        template: false 
      });
      
      cache.set_value('api_secret', 'secret123', { 
        readonly: true, 
        visible: false, 
        default: '', 
        hardcoded: false, 
        template: false 
      });
      
      cache.set_value('welcome_msg', 'Welcome {user_name}! Date: {$date}', { 
        readonly: false, 
        visible: true, 
        default: 'Welcome Guest!', 
        hardcoded: false, 
        template: true 
      });
      
      // Test injectSTM (should not include invisible api_secret)
      const template = 'User: {user_name}, Secret: {api_secret}, Message: {welcome_msg}';
      const injected = cache.injectSTM(template);
      expect(injected).toContain('User: Alice');
      expect(injected).toContain('Secret: '); // Empty because invisible
      expect(injected).toContain('Message: Welcome Alice!');
      
      // Test getSTM (should not show invisible keys)
      const stmString = cache.getSTM();
      expect(stmString).toContain('user_name: Alice');
      expect(stmString).toContain('welcome_msg: Welcome Alice!');
      expect(stmString).not.toContain('api_secret');
      
      // Test AI tools (should exclude readonly keys)
      const tools = cache.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_user_name');
      expect(Object.keys(tools)).toContain('write_welcome_msg');
      expect(Object.keys(tools)).not.toContain('write_api_secret');
      
      // Test clear with defaults
      cache.clear();
      expect(cache.get_value('user_name')).toBe('Guest');
      expect(cache.get_value('welcome_msg')).toBe('Welcome Guest!');
      expect(cache.get_value('api_secret')).toBeUndefined(); // No default
    });

    test('backward compatibility with old methods', () => {
      // Set using old method
      cache.set('old_key', 'old_value');
      
      // Should have default attributes
      const attributes = cache.get_attributes('old_key');
      expect(attributes).toEqual({
        readonly: false,
        visible: true,
        default: '',
        hardcoded: false,
        template: false,
        type: 'text' as const
      });
      
      // Old get should work
      expect(cache.get('old_key')).toBe('old_value');
      
      // Should appear in tools and STM
      const tools = cache.get_aisdk_tools();
      expect(Object.keys(tools)).toContain('write_old_key');
      
      const stmString = cache.getSTM();
      expect(stmString).toContain('old_key: old_value');
    });

    test('hardcoded keys are always readonly and never templates', () => {
      // Create a hardcoded key that tries to be non-readonly and template
      cache.set_value('hardcoded_tracker', 'tracking_value', { 
        hardcoded: true, 
        readonly: false, // This should be ignored
        template: true, // This should be ignored
        visible: true 
      });
      
      const attributes = cache.get_attributes('hardcoded_tracker');
      expect(attributes?.hardcoded).toBe(true);
      expect(attributes?.readonly).toBe(true); // Should be forced to true
      expect(attributes?.template).toBe(false); // Should be forced to false
      
      // Hardcoded keys should not appear in AI tools
      const tools = cache.get_aisdk_tools();
      expect(Object.keys(tools)).not.toContain('write_hardcoded_tracker');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string values with templates', () => {
      cache.set_value('empty_template', '', { template: true });
      const result = cache.get_value('empty_template');
      expect(result).toBe('');
    });

    test('should handle null/undefined values with templates', () => {
      cache.set_value('null_template', null, { template: true });
      cache.set_value('undefined_template', undefined, { template: true });
      
      // Should not throw errors
      expect(() => cache.get_value('null_template')).not.toThrow();
      expect(() => cache.get_value('undefined_template')).not.toThrow();
    });

    test('should handle circular template references gracefully', () => {
      cache.set_value('template_a', 'A: {template_b}', { template: true });
      cache.set_value('template_b', 'B: {template_a}', { template: true });
      
      // Should not cause infinite recursion
      expect(() => cache.get_value('template_a')).not.toThrow();
    });

    test('should handle special characters in template values', () => {
      cache.set_value('special_chars', 'Special: $@#%^&*()');
      cache.set_value('template_special', 'Value: {special_chars}', { template: true });
      
      const result = cache.get_value('template_special');
      expect(result).toBe('Value: Special: $@#%^&*()');
    });
  });
});
