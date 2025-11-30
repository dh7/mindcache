/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import type { KeyAttributes, STM, STMEntry, Listener } from './types';
import { DEFAULT_KEY_ATTRIBUTES } from './types';

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

export class MindCache {
  private stm: STM = {};
  private listeners: { [key: string]: Listener[] } = {};
  private globalListeners: Listener[] = [];

  // Internal flag to prevent sync loops when receiving remote updates
  private _isRemoteUpdate = false;

  // Helper method to encode file to base64
  private encodeFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
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
      return true;
    }
    if (!contentType) {
      return false;
    }
    if (type === 'image') {
      return contentType.startsWith('image/');
    }
    if (type === 'file') {
      return true;
    }
    return false;
  }

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

    if (entry.attributes.template) {
      const processingStack = _processingStack || new Set<string>();
      if (processingStack.has(key)) {
        return entry.value;
      }
      processingStack.add(key);
      const result = this.injectSTM(entry.value as string, processingStack);
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
    if (key === '$date' || key === '$time') {
      return;
    }

    const existingEntry = this.stm[key];
    const baseAttributes = existingEntry ? existingEntry.attributes : { ...DEFAULT_KEY_ATTRIBUTES };

    const finalAttributes = attributes ? { ...baseAttributes, ...attributes } : baseAttributes;

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

  // Internal method for setting values from remote (cloud sync)
  // This doesn't trigger the global listener to prevent sync loops
  _setFromRemote(key: string, value: any, attributes: KeyAttributes): void {
    if (key === '$date' || key === '$time') {
      return;
    }

    this._isRemoteUpdate = true;
    
    this.stm[key] = {
      value,
      attributes
    };

    if (this.listeners[key]) {
      this.listeners[key].forEach(listener => listener());
    }
    
    // Still notify global listeners for UI updates, but adapter should check _isRemoteUpdate
    this.notifyGlobalListeners();
    
    this._isRemoteUpdate = false;
  }

  // Check if current update is from remote
  isRemoteUpdate(): boolean {
    return this._isRemoteUpdate;
  }

  // Set attributes for an existing key
  set_attributes(key: string, attributes: Partial<KeyAttributes>): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hardcoded, ...allowedAttributes } = attributes;
    entry.attributes = { ...entry.attributes, ...allowedAttributes };

    if (entry.attributes.hardcoded) {
      entry.attributes.readonly = true;
      entry.attributes.template = false;
    }

    this.notifyGlobalListeners();
    return true;
  }

  set(key: string, value: any): void {
    this.set_value(key, value);
  }

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

  add_image(key: string, base64Data: string, contentType: string = 'image/jpeg', attributes?: Partial<KeyAttributes>): void {
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid image content type: ${contentType}. Must start with 'image/'`);
    }

    this.set_base64(key, base64Data, contentType, 'image', attributes);
    this.set_attributes(key, {
      type: 'image',
      contentType: contentType
    });
  }

  get_data_url(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    if (!entry.attributes.contentType) {
      return undefined;
    }

    return this.createDataUrl(entry.value as string, entry.attributes.contentType);
  }

  get_base64(key: string): string | undefined {
    const entry = this.stm[key];
    if (!entry || (entry.attributes.type !== 'image' && entry.attributes.type !== 'file')) {
      return undefined;
    }

    return entry.value as string;
  }

  has(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return true;
    }
    return key in this.stm;
  }

  delete(key: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
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

  clear(): void {
    this.stm = {};
    this.notifyGlobalListeners();
  }

  keys(): string[] {
    return [...Object.keys(this.stm), '$date', '$time'];
  }

  values(): any[] {
    const now = new Date();
    const stmValues = Object.values(this.stm).map(entry => entry.value);
    return [
      ...stmValues,
      now.toISOString().split('T')[0],
      now.toTimeString().split(' ')[0]
    ];
  }

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

  size(): number {
    return Object.keys(this.stm).length + 2;
  }

  getAll(): Record<string, any> {
    const now = new Date();
    const result: Record<string, any> = {};

    Object.entries(this.stm).forEach(([key, entry]) => {
      result[key] = entry.value;
    });

    result['$date'] = now.toISOString().split('T')[0];
    result['$time'] = now.toTimeString().split(' ')[0];

    return result;
  }

  update(newValues: Record<string, any>): void {
    Object.entries(newValues).forEach(([key, value]) => {
      if (key !== '$date' && key !== '$time') {
        this.stm[key] = {
          value,
          attributes: { ...DEFAULT_KEY_ATTRIBUTES }
        };

        if (this.listeners[key]) {
          this.listeners[key].forEach(listener => listener());
        }
      }
    });
    this.notifyGlobalListeners();
  }

  subscribe(key: string, listener: Listener): void {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(listener);
  }

  unsubscribe(key: string, listener: Listener): void {
    if (this.listeners[key]) {
      this.listeners[key] = this.listeners[key].filter(l => l !== listener);
    }
  }

  subscribeToAll(listener: Listener): void {
    this.globalListeners.push(listener);
  }

  unsubscribeFromAll(listener: Listener): void {
    this.globalListeners = this.globalListeners.filter(l => l !== listener);
  }

  private notifyGlobalListeners(): void {
    this.globalListeners.forEach(listener => listener());
  }

  injectSTM(template: string, _processingStack?: Set<string>): string {
    if (template === null || template === undefined) {
      return String(template);
    }

    const templateStr = String(template);
    const keys = templateStr.match(/\{\{([$\w]+)\}\}/g);

    if (!keys) {
      return templateStr;
    }

    const cleanKeys = keys.map(key => key.replace(/[{}]/g, ''));

    const inputValues: Record<string, string> = cleanKeys.reduce((acc, key) => {
      if (key === '$date' || key === '$time') {
        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }

      const attributes = this.get_attributes(key);
      if (_processingStack || (attributes && attributes.visible)) {
        if (attributes && (attributes.type === 'image' || attributes.type === 'file')) {
          return acc;
        }

        return {
          ...acc,
          [key]: this.get_value(key, _processingStack)
        };
      }

      return acc;
    }, {});

    return templateStr.replace(/\{\{([$\w]+)\}\}/g, (match, key) => {
      if (inputValues[key] !== undefined) {
        return inputValues[key];
      }

      const attributes = this.get_attributes(key);
      if (attributes && (attributes.type === 'image' || attributes.type === 'file')) {
        return match;
      }

      return '';
    });
  }

  getSTM(): string {
    const now = new Date();
    const entries: Array<[string, any]> = [];

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible) {
        entries.push([key, this.get_value(key)]);
      }
    });

    entries.push(['$date', now.toISOString().split('T')[0]]);
    entries.push(['$time', now.toTimeString().split(' ')[0]]);

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  getSTMObject(): Record<string, any> {
    return this.getAll();
  }

  getSTMForAPI(): Array<{key: string, value: any, type: string, contentType?: string}> {
    const now = new Date();
    const apiData: Array<{key: string, value: any, type: string, contentType?: string}> = [];

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

  getVisibleImages(): Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> {
    const imageParts: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }> = [];

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible && entry.attributes.type === 'image' && entry.attributes.contentType) {
        const dataUrl = this.createDataUrl(entry.value as string, entry.attributes.contentType);
        imageParts.push({
          type: 'file' as const,
          mediaType: entry.attributes.contentType,
          url: dataUrl,
          filename: key
        });
      }
    });

    return imageParts;
  }

  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  fromJSON(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString);
      this.deserialize(data);
    } catch (error) {
      console.error('MindCache: Failed to deserialize JSON:', error);
    }
  }

  serialize(): Record<string, STMEntry> {
    const result: Record<string, STMEntry> = {};

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (!entry.attributes.hardcoded) {
        result[key] = {
          value: entry.value,
          attributes: { ...entry.attributes }
        };
      }
    });

    return result;
  }

  deserialize(data: Record<string, STMEntry>): void {
    if (typeof data === 'object' && data !== null) {
      this.clear();

      Object.entries(data).forEach(([key, entry]) => {
        if (entry && typeof entry === 'object' && 'value' in entry && 'attributes' in entry) {
          this.stm[key] = {
            value: entry.value,
            attributes: {
              ...entry.attributes,
              tags: entry.attributes.tags || []
            }
          };
        }
      });

      this.notifyGlobalListeners();
    }
  }

  get_system_prompt(): string {
    const now = new Date();
    const promptLines: string[] = [];

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.visible) {
        if (entry.attributes.type === 'image') {
          promptLines.push(`image ${key} available`);
          return;
        }
        if (entry.attributes.type === 'file') {
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
          promptLines.push(`${key}: ${formattedValue}`);
        } else {
          const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
          const toolInstruction =
            `You can rewrite "${key}" by using the write_${sanitizedKey} tool. ` +
            'This tool DOES NOT append — start your response with the old value ' +
            `(${formattedValue})`;
          promptLines.push(`${key}: ${formattedValue}. ${toolInstruction}`);
        }
      }
    });

    promptLines.push(`$date: ${now.toISOString().split('T')[0]}`);
    promptLines.push(`$time: ${now.toTimeString().split(' ')[0]}`);

    return promptLines.join('\n');
  }

  private findKeyFromToolName(toolName: string): string | undefined {
    if (!toolName.startsWith('write_')) {
      return undefined;
    }

    const sanitizedKey = toolName.replace('write_', '');
    const allKeys = Object.keys(this.stm);
    return allKeys.find(k =>
      k.replace(/[^a-zA-Z0-9_-]/g, '_') === sanitizedKey
    );
  }

  get_aisdk_tools(): Record<string, any> {
    const tools: Record<string, any> = {};

    const writableKeys = Object.entries(this.stm)
      .filter(([, entry]) => !entry.attributes.readonly)
      .map(([key]) => key);

    writableKeys.forEach(key => {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const toolName = `write_${sanitizedKey}`;

      const entry = this.stm[key];
      const keyType = entry?.attributes.type || 'text';

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
          if (keyType === 'image' || keyType === 'file') {
            if (input.contentType) {
              this.set_base64(key, input.value, input.contentType, keyType);
            } else {
              const existingContentType = entry?.attributes.contentType;
              if (existingContentType) {
                this.set_base64(key, input.value, existingContentType, keyType);
              } else {
                throw new Error(`Content type required for ${keyType} data`);
              }
            }
          } else {
            this.set_value(key, input.value);
          }

          let resultMessage: string;
          if (keyType === 'image') {
            resultMessage = `Successfully saved image to ${key}`;
          } else if (keyType === 'file') {
            resultMessage = `Successfully saved file to ${key}`;
          } else if (keyType === 'json') {
            resultMessage = `Successfully saved JSON data to ${key}`;
          } else {
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

    if (writableKeys.length === 0) {
      return {};
    }

    return tools;
  }

  executeToolCall(
    toolName: string,
    value: any
  ): { result: string; key: string; value: any } | null {
    const originalKey = this.findKeyFromToolName(toolName);
    if (!originalKey) {
      return null;
    }

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

  addTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    if (!entry) {
      return false;
    }

    if (!entry.attributes.tags) {
      entry.attributes.tags = [];
    }

    if (!entry.attributes.tags.includes(tag)) {
      entry.attributes.tags.push(tag);
      this.notifyGlobalListeners();
      return true;
    }

    return false;
  }

  removeTag(key: string, tag: string): boolean {
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

    return false;
  }

  getTags(key: string): string[] {
    if (key === '$date' || key === '$time') {
      return [];
    }

    const entry = this.stm[key];
    return entry?.attributes.tags || [];
  }

  getAllTags(): string[] {
    const allTags = new Set<string>();

    Object.values(this.stm).forEach(entry => {
      if (entry.attributes.tags) {
        entry.attributes.tags.forEach(tag => allTags.add(tag));
      }
    });

    return Array.from(allTags);
  }

  hasTag(key: string, tag: string): boolean {
    if (key === '$date' || key === '$time') {
      return false;
    }

    const entry = this.stm[key];
    return entry?.attributes.tags?.includes(tag) || false;
  }

  getTagged(tag: string): string {
    const entries: Array<[string, any]> = [];

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.tags?.includes(tag)) {
        entries.push([key, this.get_value(key)]);
      }
    });

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  toMarkdown(): string {
    const now = new Date();
    const lines: string[] = [];
    const appendixEntries: Array<{
      key: string;
      type: string;
      contentType: string;
      base64: string;
      label: string;
    }> = [];
    let appendixCounter = 0;

    lines.push('# MindCache STM Export');
    lines.push('');
    lines.push(`Export Date: ${now.toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## STM Entries');
    lines.push('');

    Object.entries(this.stm).forEach(([key, entry]) => {
      if (entry.attributes.hardcoded) {
        return;
      }

      lines.push(`### ${key}`);
      const entryType = (entry.attributes.type && (entry.attributes.type as any) !== 'undefined') ? entry.attributes.type : 'text';
      lines.push(`- **Type**: \`${entryType}\``);
      lines.push(`- **Readonly**: \`${entry.attributes.readonly}\``);
      lines.push(`- **Visible**: \`${entry.attributes.visible}\``);
      lines.push(`- **Template**: \`${entry.attributes.template}\``);

      if (entry.attributes.tags && entry.attributes.tags.length > 0) {
        lines.push(`- **Tags**: \`${entry.attributes.tags.join('`, `')}\``);
      }

      if (entry.attributes.contentType) {
        lines.push(`- **Content Type**: \`${entry.attributes.contentType}\``);
      }

      if (entryType === 'image' || entryType === 'file') {
        const label = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        appendixEntries.push({
          key,
          type: entryType,
          contentType: entry.attributes.contentType || 'application/octet-stream',
          base64: entry.value as string,
          label
        });
      } else if (entryType === 'json') {
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
        const valueStr = String(entry.value);
        lines.push('- **Value**:');
        lines.push('```');
        lines.push(valueStr);
        lines.push('```');
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    });

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
    const pendingEntries: Record<string, Partial<STMEntry> & { appendixLabel?: string }> = {};

    this.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '## STM Entries') {
        currentSection = 'entries';
        continue;
      }
      if (trimmed === '## Appendix: Binary Data') {
        currentSection = 'appendix';
        continue;
      }

      if (trimmed === '```' || trimmed === '```json') {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = [];
          codeBlockType = currentSection === 'appendix' ? 'base64' : (trimmed === '```json' ? 'json' : 'value');
        } else {
          inCodeBlock = false;
          const content = codeBlockContent.join('\n');

          if (currentSection === 'appendix' && currentAppendixKey) {
            appendixData[currentAppendixKey].base64 = content;
          } else if (currentEntry && codeBlockType === 'json') {
            currentEntry.value = content;
          } else if (currentEntry && codeBlockType === 'value') {
            currentEntry.value = content;
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

      if (currentSection === 'entries') {
        if (trimmed.startsWith('### ')) {
          if (currentKey && currentEntry && currentEntry.attributes) {
            pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
          }

          currentKey = trimmed.substring(4);
          currentEntry = {
            value: undefined,
            attributes: {
              readonly: false,
              visible: true,
              hardcoded: false,
              template: false,
              type: 'text',
              tags: []
            }
          };
        } else if (trimmed.startsWith('- **Type**: `')) {
          const type = trimmed.match(/`([^`]+)`/)?.[1] as KeyAttributes['type'];
          if (currentEntry && type && (type as any) !== 'undefined') {
            currentEntry.attributes!.type = type;
          }
        } else if (trimmed.startsWith('- **Readonly**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.readonly = value;
          }
        } else if (trimmed.startsWith('- **Visible**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.visible = value;
          }
        } else if (trimmed.startsWith('- **Template**: `')) {
          const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
          if (currentEntry) {
            currentEntry.attributes!.template = value;
          }
        } else if (trimmed.startsWith('- **Tags**: `')) {
          const tagsStr = trimmed.substring(13, trimmed.length - 1);
          if (currentEntry) {
            currentEntry.attributes!.tags = tagsStr.split('`, `');
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
            currentEntry.value = '';
          }
        }
      }

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

    if (currentKey && currentEntry && currentEntry.attributes) {
      pendingEntries[currentKey] = currentEntry as STMEntry & { appendixLabel?: string };
    }

    Object.entries(pendingEntries).forEach(([key, entry]) => {
      const appendixLabel = (entry as any).appendixLabel;
      if (appendixLabel) {
        const appendixKey = `${appendixLabel}:${key}`;
        const appendixInfo = appendixData[appendixKey];
        if (appendixInfo && appendixInfo.base64) {
          entry.value = appendixInfo.base64;
          if (!entry.attributes!.contentType && appendixInfo.contentType) {
            entry.attributes!.contentType = appendixInfo.contentType;
          }
        }
      }

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

