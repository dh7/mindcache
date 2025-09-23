/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

interface KeyAttributes {
  readonly: boolean;
  visible: boolean;
  default: string;
  hardcoded: boolean;
  template: boolean;
}

interface STMEntry {
  value: any;
  attributes: KeyAttributes;
}

type STM = {
  [key: string]: STMEntry;
};

type Listener = () => void;

class MindCache {
  private stm: STM = {};
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: Listener[] = [];

  // Get a value from the STM (deprecated - use get_value instead)
  /** @deprecated Use get_value instead */
  get(key: string): any {
    return this.get_value(key);
  }

  // Get a value from the STM with template processing if enabled
  get_value(key: string, _processingStack?: Set<string>): any {
    if (key === '$date') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    if (key === '$time') {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }
    
    const entry = this.stm[key];
    if (!entry) {
      return undefined;
    }
    
    // If template is enabled, process the value through injectSTM
    if (entry.attributes.template) {
      // Prevent circular references
      const processingStack = _processingStack || new Set<string>();
      if (processingStack.has(key)) {
        return entry.value; // Return raw value to break circular reference
      }
      processingStack.add(key);
      const result = this.injectSTM(entry.value, processingStack);
      processingStack.delete(key);
      return result;
    }
    
    return entry.value;
  }

  // Get attributes for a key
  get_attributes(key: string): KeyAttributes | undefined {
    if (key === '$date' || key === '$time') {
      return {
        readonly: true,
        visible: true,
        default: '',
        hardcoded: true,
        template: false
      };
    }
    
    const entry = this.stm[key];
    return entry ? entry.attributes : undefined;
  }

  // Set a value in the STM with default attributes
  set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void {
    // Don't allow setting hardcoded system keys
    if (key === '$date' || key === '$time') {
      return;
    }

    const defaultAttributes: KeyAttributes = {
      readonly: false,
      visible: true,
      default: '',
      hardcoded: false,
      template: false
    };

    // If key exists, preserve existing attributes unless explicitly overridden
    const existingEntry = this.stm[key];
    const baseAttributes = existingEntry ? existingEntry.attributes : defaultAttributes;
    
    const finalAttributes = attributes ? { ...baseAttributes, ...attributes } : baseAttributes;

    // If hardcoded is true, force readonly to true and template to false
    if (finalAttributes.hardcoded) {
      finalAttributes.readonly = true;
      finalAttributes.template = false;
    }

    this.stm[key] = {
      value,
      attributes: finalAttributes
    };

    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener());
    }
    this.notifyGlobalListeners();
  }

  // Set attributes for an existing key
  set_attributes(key: string, attributes: Partial<KeyAttributes>): boolean {
    // Don't allow setting attributes for hardcoded system keys
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    // Create a copy of attributes, excluding the hardcoded property to prevent modification
    const { hardcoded, ...allowedAttributes } = attributes;
    
    // Apply the allowed attributes
    entry.attributes = { ...entry.attributes, ...allowedAttributes };
    
    // If this is a hardcoded key, ensure readonly is always true and template is always false
    if (entry.attributes.hardcoded) {
      entry.attributes.readonly = true;
      entry.attributes.template = false;
    }
    
    this.notifyGlobalListeners();
    return true;
  }

  // Set a value in the STM (uses default attributes)
  set(key: string, value: any): void {
    this.set_value(key, value);
  }

  // Check if a key exists in the STM
  has(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return true;
    }
    return key in this.stm;
  }

  // Delete a key-value pair from the STM
  delete(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return false; // Can't delete hardcoded system keys
    }
    if (!(key in this.stm)) {
      return false;
    }
    const deleted = delete this.stm[key];
    if (deleted) {
      this.notifyGlobalListeners();
      if (this.listeners[key]) {
        this.listeners[key].forEach(listener => listener());
      }
    }
    return deleted;
  }

  // Clear the entire STM and restore default values
  clear(): void {
    // Store keys that have default values
    const keysWithDefaults: Array<{key: string, defaultValue: string, attributes: KeyAttributes}> = [];
    
    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.default !== '') {
        keysWithDefaults.push({
          key,
          defaultValue: entry.attributes.default,
          attributes: entry.attributes
        });
      }
    });

    // Clear the STM
    this.stm = {};
    
    // Restore default values
    keysWithDefaults.forEach(({key, defaultValue, attributes}) => {
      this.stm[key] = {
        value: defaultValue,
        attributes
      };
    });

    this.notifyGlobalListeners();
  }

  // Get all keys in the STM
  keys(): string[] {
    return [...Object.keys(this.stm), '$date', '$time'];
  }

  // Get all values in the STM
  values(): any[] {
    const now = new Date();
    const stmValues = Object.values(this.stm).map(entry => entry.value);
    return [
      ...stmValues,
      now.toISOString().split('T')[0],
      now.toTimeString().split(' ')[0]
    ];
  }

  // Get all entries (key-value pairs) in the STM
  entries(): [string, any][] {
    const now = new Date();
    const stmEntries = Object.entries(this.stm).map(([key, entry]) => [key, entry.value] as [string, any]);
    return [
      ...stmEntries,
      ['$date', now.toISOString().split('T')[0]],
      ['$time', now.toTimeString().split(' ')[0]]
    ];
  }

  // Get the size of the STM
  size(): number {
    return Object.keys(this.stm).length + 2; // +2 for $date and $time
  }

  // Get a copy of the entire STM object (returns values only for backward compatibility)
  getAll(): Record<string, any> {
    const now = new Date();
    const result: Record<string, any> = {};
    
    // Add regular STM values
    Object.entries(this.stm).forEach(([key, entry]) => {
      result[key] = entry.value;
    });
    
    // Add system values
    result['$date'] = now.toISOString().split('T')[0];
    result['$time'] = now.toTimeString().split(' ')[0];
    
    return result;
  }

  // Update the STM with multiple key-value pairs (uses default attributes)
  update(newValues: Record<string, any>): void {
    Object.entries(newValues).forEach(([key, value]) => {
      if (key !== '$date' && key !== '$time') {
        // Set value without triggering individual notifications
        const defaultAttributes: KeyAttributes = {
          readonly: false,
          visible: true,
          default: '',
          hardcoded: false,
          template: false
        };

        this.stm[key] = {
          value,
          attributes: defaultAttributes
        };

        // Trigger key-specific listeners
        if (this.listeners[key]) {
          this.listeners[key].forEach(listener => listener());
        }
      }
    });
    // Trigger global listeners only once at the end
    this.notifyGlobalListeners();
  }

  // Subscribe to changes for a specific key
  subscribe(key: string, listener: Listener): void {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(listener);
  }

  // Unsubscribe from changes for a specific key
  unsubscribe(key: string, listener: Listener): void {
    if (this.listeners[key]) {
      this.listeners[key] = this.listeners[key].filter(l => l !== listener);
    }
  }

  // Subscribe to changes for all STM keys
  subscribeToAll(listener: Listener): void {
    this.globalListeners.push(listener);
  }

  // Unsubscribe from all STM changes
  unsubscribeFromAll(listener: Listener): void {
    this.globalListeners = this.globalListeners.filter(l => l !== listener);
  }

  // Helper method to notify all global listeners
  private notifyGlobalListeners(): void {
    this.globalListeners.forEach(listener => listener());
  }

  // Replace placeholders in a string with STM values (only uses visible keys for public injectSTM calls)
  injectSTM(template: string, _processingStack?: Set<string>): string {
    // Handle null/undefined templates
    if (template == null) {
      return String(template);
    }
    
    // Convert to string if not already
    const templateStr = String(template);
    
    // find all the keys in the template
    const keys = templateStr.match(/\{([$\w]+)\}/g);

    if (!keys) {
      return templateStr;
    }

    // Extract the actual key names without the curly braces
    const cleanKeys = keys.map(key => key.replace(/[{}]/g, ''));

    // Build inputValues with the clean keys
    const inputValues: Record<string, string> = cleanKeys.reduce((acc, key) => {
      // Always allow system keys
      if (key === '$date' || key === '$time') {
        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }
      
      // If this is internal processing (from template), allow all keys
      // If this is external call, only allow visible keys
      const attributes = this.get_attributes(key);
      if (_processingStack || (attributes && attributes.visible)) {
        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }
      
      // If key doesn't exist or is not visible (for external calls), don't include it
      return acc;
    }, {});

    // Replace the placeholders with actual values
    return templateStr.replace(/\{([$\w]+)\}/g, (match, key) => inputValues[key] || '');
  }

  // Get a formatted string of all visible STM key-value pairs
  getSTM(): string {
    const now = new Date();
    const entries: Array<[string, any]> = [];
    
    // Add visible regular STM entries
    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible) {
        // Use get_value to handle template processing
        entries.push([key, this.get_value(key)]);
      }
    });
    
    // Add system keys (always visible)
    entries.push(['$date', now.toISOString().split('T')[0]]);
    entries.push(['$time', now.toTimeString().split(' ')[0]]);
    
    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  // Get STM as a proper object (alias for getAll for clarity)
  getSTMObject(): Record<string, any> {
    return this.getAll();
  }

  // Serialize STM to JSON string (complete state)
  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  // Deserialize from JSON string and update STM (complete state)
  fromJSON(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      this.deserialize(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('MindCache: Failed to deserialize JSON:', error);
    }
  }

  // Serialize complete state (values + attributes, excluding hardcoded keys)
  serialize(): Record<string, STMEntry> {
    const result: Record<string, STMEntry> = {};
    
    Object.entries(this.stm).forEach(([key, entry]) => {
      // Only serialize non-hardcoded entries
      if (!entry.attributes.hardcoded) {
        result[key] = {
          value: entry.value,
          attributes: { ...entry.attributes }
        };
      }
    });
    
    return result;
  }

  // Deserialize complete state (values + attributes)
  deserialize(data: Record<string, STMEntry>): void {
    if (typeof data === 'object' && data !== null) {
      // Clear existing STM (preserves hardcoded keys via clear())
      this.clear();
      
      // Restore entries with their complete state
      Object.entries(data).forEach(([key, entry]) => {
        if (entry && typeof entry === 'object' && 'value' in entry && 'attributes' in entry) {
          this.stm[key] = {
            value: entry.value,
            attributes: { ...entry.attributes }
          };
        }
      });
      
      this.notifyGlobalListeners();
    }
  }

  // Generate tools for Vercel AI SDK to write STM values (excludes readonly keys)
  get_aisdk_tools(): Record<string, any> {
    const tools: Record<string, any> = {};

    // Get all current keys (excluding built-in $date and $time and readonly keys)
    const writableKeys = Object.entries(this.stm)
      .filter(([, entry]) => !entry.attributes.readonly)
      .map(([key]) => key);

    // Create a write tool for each writable key
    writableKeys.forEach(key => {
      const toolName = `write_${key}`;
      tools[toolName] = {
        description: `Write a value to the STM key: ${key}`,
        inputSchema: z.object({
          value: z.string().describe(`The value to write to ${key}`)
        }),
        execute: async (input: { value: any }) => {
          this.set_value(key, input.value);
          return {
            result: `Successfully wrote "${input.value}" to ${key}`,
            key: key,
            value: input.value
          };
        }
      };
    });

    // If no writable keys exist yet, return an empty object
    if (writableKeys.length === 0) {
      return {};
    }

    return tools;
  }


}

// Create and export a single instance of MindCache
export const mindcache = new MindCache();

// Export the class for advanced users who want to create their own instances
export { MindCache };

// Export types for TypeScript users
export type { STM, STMEntry, KeyAttributes, Listener };
