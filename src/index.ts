/* eslint-disable @typescript-eslint/no-explicit-any */
type STM = {
  [key: string]: any;
};

type Listener = () => void;

class MindCache {
  private stm: STM = {};
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: Listener[] = [];

  // Get a value from the STM
  get(key: string): any {
    if (key === '$date') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    if (key === '$time') {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }
    return this.stm[key];
  }

  // Set a value in the STM
  set(key: string, value: any): void {
    //console.log('Setting STM:', key, value);
    this.stm[key] = value;
    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener());
    }
    this.notifyGlobalListeners();
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

  // Clear the entire STM
  clear(): void {
    this.stm = {};
    this.notifyGlobalListeners();
  }

  // Get all keys in the STM
  keys(): string[] {
    return [...Object.keys(this.stm), '$date', '$time'];
  }

  // Get all values in the STM
  values(): any[] {
    const now = new Date();
    return [
      ...Object.values(this.stm),
      now.toISOString().split('T')[0],
      now.toTimeString().split(' ')[0]
    ];
  }

  // Get all entries (key-value pairs) in the STM
  entries(): [string, any][] {
    const now = new Date();
    return [
      ...Object.entries(this.stm),
      ['$date', now.toISOString().split('T')[0]],
      ['$time', now.toTimeString().split(' ')[0]]
    ];
  }

  // Get the size of the STM
  size(): number {
    return Object.keys(this.stm).length + 2; // +2 for $date and $time
  }

  // Get a copy of the entire STM object
  getAll(): STM {
    const now = new Date();
    return {
      ...this.stm,
      '$date': now.toISOString().split('T')[0],
      '$time': now.toTimeString().split(' ')[0]
    };
  }

  // Update the STM with multiple key-value pairs
  update(newSTM: STM): void {
    this.stm = { ...this.stm, ...newSTM };
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

  // Replace placeholders in a string with STM values
  injectSTM(template: string): string {
    // find all the keys in the template
    const keys = template.match(/\{([$\w]+)\}/g);

    if (!keys) {
      return template;
    }

    // Extract the actual key names without the curly braces
    const cleanKeys = keys.map(key => key.replace(/[{}]/g, ''));

    // Build inputValues with the clean keys
    const inputValues: Record<string, string> = cleanKeys.reduce((acc, key) => ({
      ...acc,
      [key]: this.get(key)
    }), {});

    // Replace the placeholders with actual values
    return template.replace(/\{([$\w]+)\}/g, (match, key) => inputValues[key] || '');
  }

  // Get a formatted string of all STM key-value pairs
  getSTM(): string {
    const now = new Date();
    const stmWithDateTime = {
      ...this.stm,
      '$date': now.toISOString().split('T')[0],
      '$time': now.toTimeString().split(' ')[0]
    };
    return Object.entries(stmWithDateTime)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  // Generate tools for Vercel AI SDK to write STM values
  get_aisdk_tools(): Record<string, any> {
    const tools: Record<string, any> = {};
    
    // Get all current keys (excluding built-in $date and $time)
    const keys = Object.keys(this.stm);
    
    // Create a write tool for each key
    keys.forEach(key => {
      const toolName = `write_${key}`;
      tools[toolName] = {
        description: `Write a value to the STM key: ${key}`,
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'string',
              description: `The value to write to ${key}`
            }
          },
          required: ['value']
        },
        execute: async (input: { value: any }) => {
          this.set(key, input.value);
          return {
            result: `Successfully wrote "${input.value}" to ${key}`,
            key: key,
            value: input.value
          };
        }
      };
    });

    // If no keys exist yet, return an empty object
    if (keys.length === 0) {
      return {};
    }

    return tools;
  }

  // Generate tools for Vercel AI SDK with the ability to create new keys
  get_aisdk_tools_with_dynamic_keys(): Record<string, any> {
    const tools: Record<string, any> = {};
    
    // Get all current keys (excluding built-in $date and $time)
    const keys = Object.keys(this.stm);
    
    // Create a write tool for each existing key
    keys.forEach(key => {
      const toolName = `write_${key}`;
      tools[toolName] = {
        description: `Write a value to the STM key: ${key}`,
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'string',
              description: `The value to write to ${key}`
            }
          },
          required: ['value']
        },
        execute: async (input: { value: any }) => {
          this.set(key, input.value);
          return {
            result: `Successfully wrote "${input.value}" to ${key}`,
            key: key,
            value: input.value
          };
        }
      };
    });

    // Add a generic tool to create and write new keys
    tools['write_stm_key'] = {
      description: 'Write a value to any STM key (creates the key if it doesn\'t exist)',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'The STM key to write to'
          },
          value: {
            type: 'string',
            description: 'The value to write to the specified key'
          }
        },
        required: ['key', 'value']
      },
      execute: async (input: { key: string; value: any }) => {
        this.set(input.key, input.value);
        return {
          result: `Successfully wrote "${input.value}" to ${input.key}`,
          key: input.key,
          value: input.value
        };
      }
    };

    return tools;
  }

}

// Create and export a single instance of MindCache
export const mindcache = new MindCache();

// Export the class for advanced users who want to create their own instances
export { MindCache };

// Export types for TypeScript users
export type { STM, Listener };
