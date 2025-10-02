/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

// Browser environment type declarations
interface FileReaderType {
  onload: ((this: FileReaderType, ev: any) => any) | null;
  onerror: ((this: FileReaderType, ev: any) => any) | null;
  result: string | ArrayBuffer | null;
  readAsDataURL(file: Blob): void;
}

declare const FileReader: {
  prototype: FileReaderType;
  new(): FileReaderType;
} | undefined;

interface KeyAttributes {
  readonly: boolean;
  visible: boolean;
  default: string;
  hardcoded: boolean;
  template: boolean;
  type: 'text' | 'image' | 'file' | 'json';
  contentType?: string; // MIME type for files/images
  tags?: string[]; // Tags for categorizing keys
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

  // Helper method to encode file to base64
  private encodeFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if we're in a browser environment
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get just the base64 data
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        // Node.js environment - reject with helpful error
        reject(new Error('FileReader not available in Node.js environment. Use set_base64() method instead.'));
      }
    });
  }

  // Helper method to create data URL from base64 and content type
  private createDataUrl(base64Data: string, contentType: string): string {
    return `data:${contentType};base64,${base64Data}`;
  }

  // Helper method to validate content type for different STM types
  private validateContentType(type: KeyAttributes['type'], contentType?: string): boolean {
    if (type === 'text' || type === 'json') {
      return true; // No content type validation needed for text/json
    }

    if (!contentType) {
      return false; // Files and images require content type
    }

    if (type === 'image') {
      return contentType.startsWith('image/');
    }

    if (type === 'file') {
      return true; // Any content type is valid for generic files
    }

    return false;
  }

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
        template: false,
        type: 'text',
        tags: []
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
      template: false,
      type: 'text',
      tags: []
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
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

  // Set a file value in the STM with base64 encoding
  async set_file(key: string, file: File, attributes?: Partial<KeyAttributes>): Promise<void> {
    const base64Data = await this.encodeFileToBase64(file);
    const contentType = file.type;

    const fileAttributes: Partial<KeyAttributes> = {
      type: contentType.startsWith('image/') ? 'image' : 'file',
      contentType,
      ...attributes
    };

    this.set_value(key, base64Data, fileAttributes);
  }

  // Set a base64 encoded value with content type
  set_base64(key: string, base64Data: string, contentType: string, type: 'image' | 'file' = 'file', attributes?: Partial<KeyAttributes>): void {
    if (!this.validateContentType(type, contentType)) {
      throw new Error(`Invalid content type ${contentType} for type ${type}`);
    }

    const fileAttributes: Partial<KeyAttributes> = {
      type,
      contentType,
      ...attributes
    };

    this.set_value(key, base64Data, fileAttributes);
  }

  // Convenience method to add an image to STM with proper attributes
  add_image(key: string, base64Data: string, contentType: string = 'image/jpeg', attributes?: Partial<KeyAttributes>): void {
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid image content type: ${contentType}. Must start with 'image/'`);
    }

    this.set_base64(key, base64Data, contentType, 'image', attributes);

    // Explicitly ensure the type is set to 'image' after setting the value
    this.set_attributes(key, {
      type: 'image',
      contentType: contentType
    });
  }

  // Get a value as data URL (for files/images)
  get_data_url(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    if (!entry.attributes.contentType) {
      return undefined;
    }

    return this.createDataUrl(entry.value, entry.attributes.contentType);
  }

  // Get raw base64 data
  get_base64(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    return entry.value;
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
    const keysWithDefaults: Array<{
      key: string;
      defaultValue: string;
      attributes: KeyAttributes;
    }> = [];

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
    keysWithDefaults.forEach(({ key, defaultValue, attributes }) => {
      this.stm[key] = {
        value: defaultValue,
        attributes: {
          ...attributes
          // Preserve all attributes including tags when clearing
        }
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
    const stmEntries = Object.entries(this.stm).map(([key, entry]) =>
      [key, entry.value] as [string, any]
    );
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
          template: false,
          type: 'text',
          tags: []
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
    if (template === null || template === undefined) {
      return String(template);
    }

    // Convert to string if not already
    const templateStr = String(template);

    // find all the keys in the template using double brackets
    const keys = templateStr.match(/\{\{([$\w]+)\}\}/g);

    if (!keys) {
      return templateStr;
    }

    // Extract the actual key names without the double curly braces
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

    // Replace the placeholders with actual values using double brackets
    return templateStr.replace(/\{\{([$\w]+)\}\}/g, (match, key) => inputValues[key] || '');
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

  // Get STM data formatted for API calls (multipart form data style)
  getSTMForAPI(): Array<{key: string, value: any, type: string, contentType?: string}> {
    const now = new Date();
    const apiData: Array<{key: string, value: any, type: string, contentType?: string}> = [];

    // Add visible regular STM entries
    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible) {
        const processedValue = entry.attributes.template ? this.get_value(key) : entry.value;

        apiData.push({
          key,
          value: processedValue,
          type: entry.attributes.type,
          contentType: entry.attributes.contentType
        });
      }
    });

    // Add system keys (always visible)
    apiData.push({
      key: '$date',
      value: now.toISOString().split('T')[0],
      type: 'text'
    });

    apiData.push({
      key: '$time',
      value: now.toTimeString().split(' ')[0],
      type: 'text'
    });

    return apiData;
  }

  // Get visible images formatted for AI SDK UIMessage file parts
  getVisibleImages(): Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> {
    const imageParts: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> = [];

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible && entry.attributes.type === 'image' && entry.attributes.contentType) {
        // Create data URL from base64 data
        const dataUrl = this.createDataUrl(entry.value, entry.attributes.contentType);
        imageParts.push({
          type: 'file' as const,
          mediaType: entry.attributes.contentType,
          url: dataUrl,
          filename: key // Use the STM key as filename
        });
      }
    });

    return imageParts;
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
            attributes: {
              ...entry.attributes,
              tags: entry.attributes.tags || [] // Ensure tags array exists
            }
          };
        }
      });

      this.notifyGlobalListeners();
    }
  }

  // Generate system prompt from all visible STM keys
  get_system_prompt(): string {
    const now = new Date();
    const promptLines: string[] = [];

    // Add visible regular STM entries
    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible) {
        // Skip images and large files in system prompt to save context
        if (entry.attributes.type === 'image' || entry.attributes.type === 'file') {
          if (entry.attributes.readonly) {
            promptLines.push(`${key}: [${entry.attributes.type.toUpperCase()}] - ${entry.attributes.contentType || 'unknown format'}`);
          } else {
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
            promptLines.push(`${key}: [${entry.attributes.type.toUpperCase()}] - ${entry.attributes.contentType || 'unknown format'}. You can update this ${entry.attributes.type} using the write_${sanitizedKey} tool.`);
          }
          return;
        }

        const value = this.get_value(key);
        const formattedValue = typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);

        if (entry.attributes.readonly) {
          // Readonly keys: just show the key-value pair
          promptLines.push(`${key}: ${formattedValue}`);
        } else {
          // Writable keys: show value and mention the tool (with sanitized tool name)
          const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
          const toolInstruction =
            `You can rewrite "${key}" by using the write_${sanitizedKey} tool. ` +
            'This tool DOES NOT append — start your response with the old value ' +
            `(${formattedValue})`;
          promptLines.push(`${key}: ${formattedValue}. ${toolInstruction}`);
        }
      }
    });

    // Add system keys (always visible and readonly)
    promptLines.push(`$date: ${now.toISOString().split('T')[0]}`);
    promptLines.push(`$time: ${now.toTimeString().split(' ')[0]}`);

    return promptLines.join('\n');
  }

  // Helper method to find original key from sanitized tool name
  private findKeyFromToolName(toolName: string): string | undefined {
    if (!toolName.startsWith('write_')) {
      return undefined;
    }

    const sanitizedKey = toolName.replace('write_', '');

    // Find the original key by checking all keys and their sanitized versions
    const allKeys = Object.keys(this.stm);
    return allKeys.find(k =>
      k.replace(/[^a-zA-Z0-9_-]/g, '_') === sanitizedKey
    );
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
      // Sanitize tool name to match OpenAI's pattern: ^[a-zA-Z0-9_-]+$
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const toolName = `write_${sanitizedKey}`;

      const entry = this.stm[key];
      const keyType = entry?.attributes.type || 'text';

      // Create appropriate schema based on the key's type
      let inputSchema;
      let description = `Write a value to the STM key: ${key}`;

      if (keyType === 'image' || keyType === 'file') {
        description += ' (expects base64 encoded data)';
        inputSchema = z.object({
          value: z.string().describe(`Base64 encoded data for ${key}`),
          contentType: z.string().optional().describe(`MIME type for the ${keyType}`)
        });
      } else if (keyType === 'json') {
        description += ' (expects JSON string)';
        inputSchema = z.object({
          value: z.string().describe(`JSON string value for ${key}`)
        });
      } else {
        inputSchema = z.object({
          value: z.string().describe(`The text value to write to ${key}`)
        });
      }

      tools[toolName] = {
        description,
        inputSchema,
        execute: async (input: { value: any; contentType?: string }) => {
          // Handle different types appropriately
          if (keyType === 'image' || keyType === 'file') {
            if (input.contentType) {
              this.set_base64(key, input.value, input.contentType, keyType);
            } else {
              // Use existing content type if available
              const existingContentType = entry?.attributes.contentType;
              if (existingContentType) {
                this.set_base64(key, input.value, existingContentType, keyType);
              } else {
                throw new Error(`Content type required for ${keyType} data`);
              }
            }
          } else {
            // For text and json, use regular set_value
            this.set_value(key, input.value);
          }

          // Create specialized success message based on type
          let resultMessage: string;
          if (keyType === 'image') {
            resultMessage = `Successfully saved image to ${key}`;
          } else if (keyType === 'file') {
            resultMessage = `Successfully saved file to ${key}`;
          } else if (keyType === 'json') {
            resultMessage = `Successfully saved JSON data to ${key}`;
          } else {
            // For text type, include the actual value
            resultMessage = `Successfully wrote "${input.value}" to ${key}`;
          }

          return {
            result: resultMessage,
            key: key,
            value: input.value,
            type: keyType,
            contentType: input.contentType,
            sanitizedKey: sanitizedKey
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

  // Public method for client-side tool execution
  executeToolCall(
    toolName: string,
    value: any
  ): { result: string; key: string; value: any } | null {
    const originalKey = this.findKeyFromToolName(toolName);
    if (!originalKey) {
      return null;
    }

    // Check if key is readonly
    const entry = this.stm[originalKey];
    if (entry && entry.attributes.readonly) {
      return null;
    }

    this.set_value(originalKey, value);
    return {
      result: `Successfully wrote "${value}" to ${originalKey}`,
      key: originalKey,
      value: value
    };
  }

  // Add a tag to a key
  addTag(key: string, tag: string): boolean {
    // Don't allow tagging hardcoded system keys
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    // Initialize tags array if it doesn't exist
    if (!entry.attributes.tags) {
      entry.attributes.tags = [];
    }

    // Add tag if it doesn't already exist
    if (!entry.attributes.tags.includes(tag)) {
      entry.attributes.tags.push(tag);
      this.notifyGlobalListeners();
      return true;
    }

    return false; // Tag already exists
  }

  // Remove a tag from a key
  removeTag(key: string, tag: string): boolean {
    // Don't allow modifying hardcoded system keys
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry || !entry.attributes.tags) {
      return false;
    }

    const tagIndex = entry.attributes.tags.indexOf(tag);
    if (tagIndex > -1) {
      entry.attributes.tags.splice(tagIndex, 1);
      this.notifyGlobalListeners();
      return true;
    }

    return false; // Tag not found
  }

  // Get all tags for a key
  getTags(key: string): string[] {
    if (key === '$date' || key === '$time') {
      return []; // System keys have no tags
    }

    const entry = this.stm[key];
    return entry?.attributes.tags || [];
  }

  // Check if a key has a specific tag
  hasTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false; // System keys have no tags
    }

    const entry = this.stm[key];
    return entry?.attributes.tags?.includes(tag) || false;
  }

  // Get a formatted string of all entries with a specific tag (ignores visible attribute)
  getTagged(tag: string): string {
    const entries: Array<[string, any]> = [];

    // Add regular STM entries that have the specified tag
    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.tags?.includes(tag)) {
        // Use get_value to handle template processing
        entries.push([key, this.get_value(key)]);
      }
    });

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  // Export STM to Markdown format
  toMarkdown(): string {
    const now = new Date();
    const lines: string[] = [];
    const appendixEntries: Array<{ key: string; type: string; contentType: string; base64: string; label: string }> = [];
    let appendixCounter = 0;
    const appendixLabels: Record<string, string> = {};

    // Header
    lines.push('# MindCache STM Export');
    lines.push('');
    lines.push(`Export Date: ${now.toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## STM Entries');
    lines.push('');

    // Process each entry
    Object.entries(this.stm).forEach(([key, entry]) => {
      // Skip hardcoded keys - they won't be serialized
      if (entry.attributes.hardcoded) {
        return;
      }

      lines.push(`### ${key}`);
      // Bug fix #1: Ensure type is always 'text' if undefined or the string "undefined"
      const entryType = (entry.attributes.type && (entry.attributes.type as any) !== 'undefined') ? entry.attributes.type : 'text';
      lines.push(`- **Type**: \`${entryType}\``);

      // Handle content type for files/images
      if (entry.attributes.contentType) {
        lines.push(`- **Content Type**: \`${entry.attributes.contentType}\``);
      }

      // Handle value based on type
      if (entryType === 'image' || entryType === 'file') {
        // Create appendix reference
        const label = String.fromCharCode(65 + appendixCounter); // A, B, C, etc.
        appendixLabels[key] = label;
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        // Store for appendix section
        appendixEntries.push({
          key,
          type: entryType,
          contentType: entry.attributes.contentType || 'application/octet-stream',
          base64: entry.value,
          label
        });
      } else if (entryType === 'json') {
        // Format JSON with proper indentation
        lines.push('- **Value**:');
        lines.push('```json');
        try {
          const jsonValue = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2);
          lines.push(jsonValue);
        } catch {
          lines.push(String(entry.value));
        }
        lines.push('```');
      } else {
        // Text type - handle multiline
        const valueStr = String(entry.value);
        if (valueStr.includes('\n')) {
          lines.push('- **Value**:');
          lines.push('```');
          lines.push(valueStr);
          lines.push('```');
        } else {
          lines.push(`- **Value**: \`${valueStr}\``);
        }
      }

      // Attributes
      lines.push('- **Attributes**:');
      lines.push(`  - Readonly: \`${entry.attributes.readonly}\``);
      lines.push(`  - Visible: \`${entry.attributes.visible}\``);
      lines.push(`  - Template: \`${entry.attributes.template}\``);
      
      // Bug fix #2 & #3: Handle default values properly (multiline text and appendix for images/files)
      const defaultValue = entry.attributes.default || '';
      if (defaultValue && (entryType === 'image' || entryType === 'file')) {
        // Default image/file should go to appendix
        const defaultLabel = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`  - Default: [See Appendix ${defaultLabel}]`);
        
        appendixEntries.push({
          key: `${key} (default)`,
          type: entryType,
          contentType: entry.attributes.contentType || 'application/octet-stream',
          base64: defaultValue,
          label: defaultLabel
        });
      } else if (defaultValue && defaultValue.includes('\n')) {
        // Multiline text default
        lines.push('  - Default:');
        lines.push('```');
        lines.push(defaultValue);
        lines.push('```');
      } else {
        // Inline default
        lines.push(`  - Default: \`${defaultValue}\``);
      }
      
      if (entry.attributes.tags && entry.attributes.tags.length > 0) {
        lines.push(`  - Tags: \`${entry.attributes.tags.join('`, `')}\``);
      } else {
        lines.push('  - Tags: (none)');
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    });

    // Add appendix section if there are binary entries
    if (appendixEntries.length > 0) {
      lines.push('## Appendix: Binary Data');
      lines.push('');

      appendixEntries.forEach(({ key, contentType, base64, label }) => {
        lines.push(`### Appendix ${label}: ${key}`);
        lines.push(`**Type**: ${contentType}`);
        lines.push('');
        lines.push('```');
        lines.push(base64);
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    lines.push('*End of MindCache Export*');

    return lines.join('\n');
  }

  // Import STM from Markdown format
  fromMarkdown(markdown: string): void {
    const lines = markdown.split('\n');
    let currentSection: 'header' | 'entries' | 'appendix' = 'header';
    let currentKey: string | null = null;
    let currentEntry: Partial<STMEntry> | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockType: 'value' | 'json' | 'base64' | 'default' | null = null;
    const appendixData: Record<string, { contentType: string; base64: string }> = {};
    let currentAppendixKey: string | null = null;
    const pendingEntries: Record<string, Partial<STMEntry> & { appendixLabel?: string; defaultAppendixLabel?: string }> = {};

    // Clear existing STM first
    this.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect sections
      if (trimmed === '## STM Entries') {
        currentSection = 'entries';
        continue;
      }
      if (trimmed === '## Appendix: Binary Data') {
        currentSection = 'appendix';
        continue;
      }

      // Handle code blocks
      if (trimmed === '```' || trimmed === '```json') {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = [];
          codeBlockType = currentSection === 'appendix' ? 'base64' : (trimmed === '```json' ? 'json' : 'value');
        } else {
          inCodeBlock = false;
          const content = codeBlockContent.join('\n');

          if (currentSection === 'appendix' && currentAppendixKey) {
            // Store appendix base64 data
            appendixData[currentAppendixKey].base64 = content;
          } else if (currentEntry && codeBlockType === 'json') {
            currentEntry.value = content;
          } else if (currentEntry && codeBlockType === 'value') {
            currentEntry.value = content;
          } else if (currentEntry && codeBlockType === 'default') {
            // Multiline default value
            currentEntry.attributes!.default = content;
          }

          codeBlockContent = [];
          codeBlockType = null;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Parse entries section
      if (currentSection === 'entries') {
        if (trimmed.startsWith('### ')) {
          // Save previous entry if exists
          if (currentKey && currentEntry && currentEntry.attributes) {
            pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
          }

          // Start new entry
          currentKey = trimmed.substring(4);
          currentEntry = {
            value: undefined,
            attributes: {
              readonly: false,
              visible: true,
              default: '',
              hardcoded: false,
              template: false,
              type: 'text',
              tags: []
            }
          };
        } else if (trimmed.startsWith('- **Type**: `')) {
          const type = trimmed.match(/`([^`]+)`/)?.[1] as KeyAttributes['type'];
          // Don't store "undefined" string - treat it as missing and keep default 'text'
          if (currentEntry && type && (type as any) !== 'undefined') {
            currentEntry.attributes!.type = type;
          }
        } else if (trimmed.startsWith('- **Content Type**: `')) {
          const contentType = trimmed.match(/`([^`]+)`/)?.[1];
          if (currentEntry && contentType) {
            currentEntry.attributes!.contentType = contentType;
          }
        } else if (trimmed.startsWith('- **Value**: `')) {
          const value = trimmed.substring(14, trimmed.length - 1);
          if (currentEntry) {
            currentEntry.value = value;
          }
        } else if (trimmed.startsWith('- **Value**: [See Appendix ')) {
          const labelMatch = trimmed.match(/Appendix ([A-Z])\]/);
          if (currentEntry && labelMatch && currentKey) {
            (currentEntry as any).appendixLabel = labelMatch[1];
            // Set a placeholder value so the entry is saved
            currentEntry.value = '';
          }
        } else if (trimmed.startsWith('- Readonly: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.readonly = value;
          }
        } else if (trimmed.startsWith('- Visible: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.visible = value;
          }
        } else if (trimmed.startsWith('- Template: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.template = value;
          }
        } else if (trimmed.startsWith('- Default:')) {
          // Check if it's an appendix reference or multiline
          if (trimmed.includes('[See Appendix ')) {
            const labelMatch = trimmed.match(/Appendix ([A-Z])\]/);
            if (currentEntry && labelMatch) {
              (currentEntry as any).defaultAppendixLabel = labelMatch[1];
            }
          } else if (trimmed === '- Default:') {
            // Next lines will be a code block - set type for code block handler
            codeBlockType = 'default';
          } else {
            // Inline default: `- Default: `value``
            const value = trimmed.substring(12, trimmed.length - 1);
            if (currentEntry) {
              currentEntry.attributes!.default = value;
            }
          }
        } else if (trimmed.startsWith('  - Default: `')) {
          const value = trimmed.substring(14, trimmed.length - 1);
          if (currentEntry) {
            currentEntry.attributes!.default = value;
          }
        } else if (trimmed.startsWith('  - Default:')) {
          // Check if it's an appendix reference or multiline
          if (trimmed.includes('[See Appendix ')) {
            const labelMatch = trimmed.match(/Appendix ([A-Z])\]/);
            if (currentEntry && labelMatch) {
              (currentEntry as any).defaultAppendixLabel = labelMatch[1];
            }
          } else if (trimmed === '  - Default:') {
            // Next lines will be a code block - set type for code block handler
            codeBlockType = 'default';
          }
        } else if (trimmed.startsWith('- Tags: `') || trimmed.startsWith('  - Tags: `')) {
          const startPos = trimmed.startsWith('  - Tags: `') ? 11 : 9;
          const tagsStr = trimmed.substring(startPos, trimmed.length - 1);
          if (currentEntry && tagsStr !== '(none)') {
            currentEntry.attributes!.tags = tagsStr.split('`, `');
          }
        } else if (trimmed === '  - Tags: (none)') {
          // Handle indented (none) case
          if (currentEntry) {
            currentEntry.attributes!.tags = [];
          }
        }
      }

      // Parse appendix section
      if (currentSection === 'appendix') {
        if (trimmed.startsWith('### Appendix ')) {
          const match = trimmed.match(/### Appendix ([A-Z]): (.+)/);
          if (match) {
            const label = match[1];
            const key = match[2];
            currentAppendixKey = `${label}:${key}`;
            appendixData[currentAppendixKey] = { contentType: '', base64: '' };
          }
        } else if (trimmed.startsWith('**Type**: ')) {
          const contentType = trimmed.substring(10);
          if (currentAppendixKey) {
            appendixData[currentAppendixKey].contentType = contentType;
          }
        }
      }
    }

    // Save last entry
    if (currentKey && currentEntry && currentEntry.attributes) {
      pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
    }

    // Now combine entries with appendix data and populate STM
    Object.entries(pendingEntries).forEach(([key, entry]) => {
      const appendixLabel = (entry as any).appendixLabel;
      if (appendixLabel) {
        // Find matching appendix data
        const appendixKey = `${appendixLabel}:${key}`;
        const appendixInfo = appendixData[appendixKey];
        if (appendixInfo && appendixInfo.base64) {
          entry.value = appendixInfo.base64;
          if (!entry.attributes!.contentType && appendixInfo.contentType) {
            entry.attributes!.contentType = appendixInfo.contentType;
          }
        }
      }

      // Handle default appendix reference
      const defaultAppendixLabel = (entry as any).defaultAppendixLabel;
      if (defaultAppendixLabel) {
        // Find matching appendix data for default
        const defaultAppendixKey = `${defaultAppendixLabel}:${key} (default)`;
        const defaultAppendixInfo = appendixData[defaultAppendixKey];
        if (defaultAppendixInfo && defaultAppendixInfo.base64) {
          entry.attributes!.default = defaultAppendixInfo.base64;
        }
      }

      // Set the entry in STM (value can be undefined for entries without value line)
      if (entry.value !== undefined && entry.attributes) {
        this.stm[key] = {
          value: entry.value,
          attributes: entry.attributes as KeyAttributes
        };
      }
    });

    this.notifyGlobalListeners();
  }


}

// Create and export a single instance of MindCache
export const mindcache = new MindCache();

// Export the class for advanced users who want to create their own instances
export { MindCache };

// Export types for TypeScript users
export type { STM, STMEntry, KeyAttributes, Listener };
