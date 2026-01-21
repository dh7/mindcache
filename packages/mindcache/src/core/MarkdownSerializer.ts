/* eslint-disable @typescript-eslint/no-explicit-any */
import type { KeyAttributes, STM, SystemTag } from './types';
import { DEFAULT_KEY_ATTRIBUTES } from './types';

/**
 * Helper interface for MindCache-like objects to avoid circular imports.
 * The MarkdownSerializer only needs these methods/properties.
 */
export interface IMarkdownSerializable {
    getSortedKeys(): string[];
    get_value(key: string): any;
    get_attributes(key: string): KeyAttributes | undefined;
    set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void;
    clear(): void;
}

/**
 * Options for markdown export
 */
export interface MarkdownExportOptions {
  /** Name/title for the export (defaults to 'MindCache Export') */
  name?: string;
  /** Description to include below the title */
  description?: string;
}

/**
 * Serializes and deserializes MindCache data to/from Markdown format.
 */
export class MarkdownSerializer {
  /**
     * Export MindCache data to Markdown format.
     */
  static toMarkdown(mc: IMarkdownSerializable, options?: MarkdownExportOptions): string {
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

    const name = options?.name || 'MindCache Export';
    lines.push(`# ${name}`);
    lines.push('');
    if (options?.description) {
      lines.push(options.description);
      lines.push('');
    }
    lines.push(`Export Date: ${now.toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Keys & Values');
    lines.push('');

    const sortedKeys = mc.getSortedKeys();
    sortedKeys.forEach(key => {
      const attributes = mc.get_attributes(key);
      const value = mc.get_value(key);

      lines.push(`### ${key}`);
      const entryType = attributes?.type || 'text';
      // Only show type if not 'text' (the default)
      if (entryType !== 'text') {
        lines.push(`- **Type**: \`${entryType}\``);
      }
      // Only show system tags if there are any
      const systemTags = attributes?.systemTags;
      if (systemTags && systemTags.length > 0) {
        lines.push(`- **System Tags**: \`${systemTags.join(', ')}\``);
      }
      // Only show z-index if non-zero
      const zIndex = attributes?.zIndex ?? 0;
      if (zIndex !== 0) {
        lines.push(`- **Z-Index**: \`${zIndex}\``);
      }

      if (attributes?.contentTags && attributes.contentTags.length > 0) {
        lines.push(`- **Tags**: \`${attributes.contentTags.join('`, `')}\``);
      }

      if (attributes?.contentType) {
        lines.push(`- **Content Type**: \`${attributes.contentType}\``);
      }

      if (entryType === 'image' || entryType === 'file') {
        const label = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        appendixEntries.push({
          key,
          type: entryType,
          contentType: attributes?.contentType || 'application/octet-stream',
          base64: value as string,
          label
        });
      } else if (entryType === 'json') {
        lines.push('- **Value**:');
        lines.push('```json');
        try {
          const jsonValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          lines.push(jsonValue);
        } catch {
          lines.push(String(value));
        }
        lines.push('```');
      } else {
        // Use code blocks for ALL values to support multi-line content
        lines.push('- **Value**:');
        lines.push('```');
        lines.push(String(value));
        lines.push('```');
      }

      lines.push('');
    });

    // Add appendix for binary data
    if (appendixEntries.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Appendix: Binary Data');
      lines.push('');

      appendixEntries.forEach(entry => {
        lines.push(`### Appendix ${entry.label}: ${entry.key}`);
        lines.push(`- **Type**: \`${entry.type}\``);
        lines.push(`- **Content Type**: \`${entry.contentType}\``);
        lines.push('- **Base64 Data**:');
        lines.push('```');
        lines.push(entry.base64);
        lines.push('```');
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
     * Import Markdown into MindCache data.
     * @param markdown The markdown string to import
     * @param mc The MindCache instance to import into
     * @param merge If false (default), clears existing data before importing
     */
  static fromMarkdown(markdown: string, mc: IMarkdownSerializable, merge: boolean = false): void {
    const lines = markdown.split('\n');
    let currentKey: string | null = null;
    let currentAttributes: Partial<KeyAttributes> = {};
    let currentValue: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    const _appendixData: Record<string, string> = {};

    // Clear existing data unless merging
    if (!merge) {
      mc.clear();
    }

    for (const line of lines) {
      // Parse key headers
      if (line.startsWith('### ') && !line.startsWith('### Appendix')) {
        // Save previous entry
        if (currentKey && currentValue !== null) {
          mc.set_value(currentKey, currentValue.trim(), currentAttributes);
        }

        currentKey = line.substring(4).trim();
        currentAttributes = {};
        currentValue = null;
        continue;
      }

      // Parse appendix
      if (line.startsWith('### Appendix ')) {
        // Save previous appendix entry
        if (currentKey && currentValue !== null) {
          mc.set_value(currentKey, currentValue.trim(), currentAttributes);
        }

        const match = line.match(/### Appendix ([A-Z]): (.+)/);
        if (match) {
          currentKey = match[2];
          currentAttributes = {};
          currentValue = null;
        }
        continue;
      }

      // Parse attributes
      if (line.startsWith('- **Type**:')) {
        const type = line.match(/`(.+)`/)?.[1] as KeyAttributes['type'];
        if (type) {
          currentAttributes.type = type;
        }
        continue;
      }
      if (line.startsWith('- **System Tags**:')) {
        const tagsStr = line.match(/`([^`]+)`/)?.[1] || '';
        if (tagsStr !== 'none') {
          currentAttributes.systemTags = tagsStr.split(', ').filter(t => t) as SystemTag[];
        }
        continue;
      }
      if (line.startsWith('- **Z-Index**:')) {
        const zIndex = parseInt(line.match(/`(\d+)`/)?.[1] || '0', 10);
        currentAttributes.zIndex = zIndex;
        continue;
      }
      if (line.startsWith('- **Tags**:')) {
        const tags = line.match(/`([^`]+)`/g)?.map(t => t.slice(1, -1)) || [];
        currentAttributes.contentTags = tags;
        continue;
      }
      if (line.startsWith('- **Content Type**:')) {
        currentAttributes.contentType = line.match(/`(.+)`/)?.[1];
        continue;
      }
      // Handle Base64 Data from appendix
      if (line.startsWith('- **Base64 Data**:')) {
        // Expect code block on next line
        currentValue = '';
        continue;
      }
      // Handle Value lines - including appendix references
      if (line.startsWith('- **Value**:')) {
        const afterValue = line.substring(12).trim();

        if (afterValue.includes('[See Appendix')) {
          // This is an appendix reference - save the entry now with placeholder
          // The value will be updated when we parse the appendix
          if (currentKey) {
            mc.set_value(currentKey, '', currentAttributes);
          }
          currentValue = null; // Reset so we don't overwrite later
          continue;
        }

        if (afterValue === '') {
          // Empty - expect code block on next line
          currentValue = '';
        } else if (afterValue === '```' || afterValue === '```json') {
          // Code block starts on this line, content on next
          inCodeBlock = true;
          codeBlockContent = [];
          currentValue = '';
        } else if (afterValue.startsWith('```')) {
          // Code block with content on same line: ```mindmap or ```some text
          inCodeBlock = true;
          codeBlockContent = [afterValue.substring(3)]; // Capture content after ```
          currentValue = '';
        } else {
          // Inline value (legacy format)
          currentValue = afterValue;
        }
        continue;
      }

      // Handle code blocks - check trimmed line for robustness
      const trimmedLine = line.trim();
      if (trimmedLine === '```json' || trimmedLine === '```') {
        if (inCodeBlock) {
          // End of code block
          inCodeBlock = false;
          if (currentKey && codeBlockContent.length > 0) {
            currentValue = codeBlockContent.join('\n');
          }
          codeBlockContent = [];
        } else {
          inCodeBlock = true;
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
      } else if (currentKey && currentValue !== null) {
        // Stop appending when we hit section markers
        if (line.trim() === '---' || line.startsWith('## Appendix')) {
          // Save the current entry and reset
          mc.set_value(currentKey, currentValue.trim(), currentAttributes);
          currentKey = null;
          currentValue = null;
          currentAttributes = {};
        } else {
          currentValue += '\n' + line;
        }
      }
    }

    // Save last entry
    if (currentKey && currentValue !== null) {
      mc.set_value(currentKey, currentValue.trim(), currentAttributes);
    }

    // If no keys were parsed but we have content, treat as unstructured text
    // But skip if this is an STM export format (which might just be empty)

    // Check if we parsed any keys
    const hasParsedKeys = lines.some(line => line.startsWith('### ') && !line.startsWith('### Appendix'));
    const isSTMExport = markdown.includes('# MindCache STM Export') ||
                        markdown.includes('## STM Entries') ||
                        markdown.includes('## Keys & Values') ||
                        markdown.includes('# MindCache Export');

    if (!hasParsedKeys && !isSTMExport && markdown.trim().length > 0) {
      mc.set_value('imported_content', markdown.trim(), {
        type: 'text',
        systemTags: ['SystemPrompt', 'LLMWrite'], // Default assumptions
        zIndex: 0
      });
    }
  }

  /**
     * Parse markdown and return STM data without applying to a MindCache instance.
     * Useful for validation or preview.
     */
  static parseMarkdown(markdown: string): STM {
    const result: STM = {};
    const lines = markdown.split('\n');
    let currentKey: string | null = null;
    let currentAttributes: Partial<KeyAttributes> = {};
    let currentValue: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    const saveEntry = () => {
      if (currentKey && currentValue !== null) {
        result[currentKey] = {
          value: currentValue.trim(),
          attributes: { ...DEFAULT_KEY_ATTRIBUTES, ...currentAttributes } as KeyAttributes
        };
      }
    };

    for (const line of lines) {
      if (line.startsWith('### ') && !line.startsWith('### Appendix')) {
        saveEntry();
        currentKey = line.substring(4).trim();
        currentAttributes = {};
        currentValue = null;
        continue;
      }

      if (line.startsWith('### Appendix ')) {
        saveEntry();
        const match = line.match(/### Appendix ([A-Z]): (.+)/);
        if (match) {
          currentKey = match[2];
          currentAttributes = {};
          currentValue = null;
        }
        continue;
      }

      if (line.startsWith('- **Type**:')) {
        const type = line.match(/`(.+)`/)?.[1] as KeyAttributes['type'];
        if (type) {
          currentAttributes.type = type;
        }
        continue;
      }
      if (line.startsWith('- **System Tags**:')) {
        const tagsStr = line.match(/`([^`]+)`/)?.[1] || '';
        if (tagsStr !== 'none') {
          currentAttributes.systemTags = tagsStr.split(', ').filter(t => t) as SystemTag[];
        }
        continue;
      }
      if (line.startsWith('- **Z-Index**:')) {
        const zIndex = parseInt(line.match(/`(\d+)`/)?.[1] || '0', 10);
        currentAttributes.zIndex = zIndex;
        continue;
      }
      if (line.startsWith('- **Tags**:')) {
        const tags = line.match(/`([^`]+)`/g)?.map(t => t.slice(1, -1)) || [];
        currentAttributes.contentTags = tags;
        continue;
      }
      if (line.startsWith('- **Content Type**:')) {
        currentAttributes.contentType = line.match(/`(.+)`/)?.[1];
        continue;
      }
      if (line.startsWith('- **Base64 Data**:')) {
        currentValue = '';
        continue;
      }
      if (line.startsWith('- **Value**:')) {
        const afterValue = line.substring(12).trim();
        if (afterValue.includes('[See Appendix')) {
          currentValue = '';
          continue;
        }
        if (afterValue === '' || afterValue === '```' || afterValue === '```json') {
          inCodeBlock = afterValue !== '';
          codeBlockContent = [];
          currentValue = '';
        } else if (afterValue.startsWith('```')) {
          inCodeBlock = true;
          codeBlockContent = [afterValue.substring(3)];
          currentValue = '';
        } else {
          currentValue = afterValue;
        }
        continue;
      }

      const trimmedLine = line.trim();
      if (trimmedLine === '```json' || trimmedLine === '```') {
        if (inCodeBlock) {
          inCodeBlock = false;
          if (currentKey && codeBlockContent.length > 0) {
            currentValue = codeBlockContent.join('\n');
          }
          codeBlockContent = [];
        } else {
          inCodeBlock = true;
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
      } else if (currentKey && currentValue !== null) {
        if (line.trim() === '---' || line.startsWith('## Appendix')) {
          saveEntry();
          currentKey = null;
          currentValue = null;
          currentAttributes = {};
        } else {
          currentValue += '\n' + line;
        }
      }
    }

    saveEntry();

    // Handle unstructured content
    const hasParsedKeys = lines.some(line => line.startsWith('### ') && !line.startsWith('### Appendix'));
    const isSTMExport = markdown.includes('# MindCache STM Export') ||
                        markdown.includes('## STM Entries') ||
                        markdown.includes('## Keys & Values') ||
                        markdown.includes('# MindCache Export');

    if (!hasParsedKeys && !isSTMExport && markdown.trim().length > 0) {
      result['imported_content'] = {
        value: markdown.trim(),
        attributes: {
          ...DEFAULT_KEY_ATTRIBUTES,
          systemTags: ['SystemPrompt', 'LLMWrite']
        }
      };
    }

    return result;
  }
}
