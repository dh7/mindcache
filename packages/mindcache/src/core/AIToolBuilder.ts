/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import type { KeyAttributes, CustomTypeDefinition } from './types';
import { SchemaParser } from './SchemaParser';

/**
 * Interface for MindCache methods needed by AIToolBuilder.
 * This avoids circular dependencies while enabling the builder to access MindCache internals.
 */
export interface IAIToolBuildable {
    // Key enumeration and context filtering
    keys(): string[];
    keyMatchesContext(key: string): boolean;

    // Value access
    get_value(key: string): any;
    get_attributes(key: string): KeyAttributes | undefined;
    set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void;
    llm_set_key(key: string, value: any): boolean;

    // Document operations
    get_document(key: string): Y.Text | undefined;
    insert_text(key: string, index: number, text: string): void;
    _replaceDocumentText(key: string, newText: string, diffThreshold?: number): void;

    // Custom type operations
    getTypeSchema(typeName: string): CustomTypeDefinition | undefined;
    getKeyType(key: string): string | undefined;
}

/**
 * Builds Vercel AI SDK compatible tools and system prompts from MindCache data.
 */
export class AIToolBuilder {
  /**
     * Sanitize key name for use in tool names
     */
  static sanitizeKeyForTool(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
     * Find original key from sanitized tool name
     */
  static findKeyFromSanitizedTool(mc: IAIToolBuildable, sanitizedKey: string): string | undefined {
    for (const key of mc.keys()) {
      if (AIToolBuilder.sanitizeKeyForTool(key) === sanitizedKey) {
        return key;
      }
    }
    return undefined;
  }

  /**
     * Generate Vercel AI SDK compatible tools for writable keys.
     * For document type keys, generates additional tools: append_, insert_, edit_
     *
     * Security: All tools use llm_set_key internally which:
     * - Only modifies VALUES, never attributes/systemTags
     * - Prevents LLMs from escalating privileges
     */
  static createVercelAITools(mc: IAIToolBuildable): Record<string, any> {
    const tools: Record<string, any> = {};

    for (const key of mc.keys()) {
      // Skip system keys
      if (key.startsWith('$')) {
        continue;
      }

      // Skip keys that don't match context
      if (!mc.keyMatchesContext(key)) {
        continue;
      }

      const attributes = mc.get_attributes(key);

      // Check if key has LLMWrite access (writable by LLM)
      const isWritable = attributes?.systemTags?.includes('LLMWrite');

      if (!isWritable) {
        continue;
      }

      const sanitizedKey = AIToolBuilder.sanitizeKeyForTool(key);
      const isDocument = attributes?.type === 'document';

      // Check for custom type schema
      const customTypeName = mc.getKeyType(key);
      const customType = customTypeName ? mc.getTypeSchema(customTypeName) : undefined;

      // Build description with custom type guidance if applicable
      let writeDescription: string;
      if (customType) {
        const schemaGuidance = SchemaParser.toPromptDescription(customType);
        const example = SchemaParser.generateExample(customType);
        writeDescription = `Write a value to "${key}" that must follow this schema:\n${schemaGuidance}\n\nExample format:\n${example}`;
      } else if (isDocument) {
        writeDescription = `Rewrite the entire "${key}" document`;
      } else {
        writeDescription = `Write a value to the STM key: ${key}`;
      }

      // 1. write_ tool (for all writable keys)
      tools[`write_${sanitizedKey}`] = {
        description: writeDescription,
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string', description: customType ? `Value following ${customTypeName} schema` : (isDocument ? 'New document content' : 'The value to write') }
          },
          required: ['value']
        },
        execute: async ({ value }: { value: any }) => {
          // Use llm_set_key for security - only modifies value, not attributes
          const success = mc.llm_set_key(key, value);
          if (success) {
            return {
              result: `Successfully wrote "${value}" to ${key}`,
              key,
              value
            };
          }
          return {
            result: `Failed to write to ${key} - permission denied or key not found`,
            key,
            error: true
          };
        }
      };

      // For document type, add additional tools
      if (isDocument) {
        // 2. append_ tool
        tools[`append_${sanitizedKey}`] = {
          description: `Append text to the end of "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to append' }
            },
            required: ['text']
          },
          execute: async ({ text }: { text: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            const yText = mc.get_document(key);
            if (yText) {
              yText.insert(yText.length, text);
              return {
                result: `Successfully appended to ${key}`,
                key,
                appended: text
              };
            }
            return { result: `Document ${key} not found`, key };
          }
        };

        // 3. insert_ tool
        tools[`insert_${sanitizedKey}`] = {
          description: `Insert text at a position in "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              index: { type: 'number', description: 'Position to insert at (0 = start)' },
              text: { type: 'string', description: 'Text to insert' }
            },
            required: ['index', 'text']
          },
          execute: async ({ index, text }: { index: number; text: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            mc.insert_text(key, index, text);
            return {
              result: `Successfully inserted text at position ${index} in ${key}`,
              key,
              index,
              inserted: text
            };
          }
        };

        // 4. edit_ tool (find and replace)
        tools[`edit_${sanitizedKey}`] = {
          description: `Find and replace text in "${key}" document`,
          inputSchema: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Text to find' },
              replace: { type: 'string', description: 'Replacement text' }
            },
            required: ['find', 'replace']
          },
          execute: async ({ find, replace }: { find: string; replace: string }) => {
            // Check permission first
            if (!attributes?.systemTags?.includes('LLMWrite')) {
              return { result: `Permission denied for ${key}`, key, error: true };
            }
            const yText = mc.get_document(key);
            if (yText) {
              const text = yText.toString();
              const idx = text.indexOf(find);
              if (idx !== -1) {
                yText.delete(idx, find.length);
                yText.insert(idx, replace);
                return {
                  result: `Successfully replaced "${find}" with "${replace}" in ${key}`,
                  key,
                  find,
                  replace,
                  index: idx
                };
              }
              return { result: `Text "${find}" not found in ${key}`, key };
            }
            return { result: `Document ${key} not found`, key };
          }
        };
      }
    }

    return tools;
  }

  /**
     * Generate a system prompt containing all visible STM keys and their values.
     * Indicates which tools can be used to modify writable keys.
     */
  static getSystemPrompt(mc: IAIToolBuildable): string {
    const lines: string[] = [];

    for (const key of mc.keys()) {
      // Skip system keys for now
      if (key.startsWith('$')) {
        continue;
      }

      // Skip keys that don't match context
      if (!mc.keyMatchesContext(key)) {
        continue;
      }

      const attributes = mc.get_attributes(key);

      // Check visibility - key is visible if it has SystemPrompt or LLMRead tag
      const isVisible = attributes?.systemTags?.includes('SystemPrompt') ||
                attributes?.systemTags?.includes('LLMRead');

      if (!isVisible) {
        continue;
      }

      const value = mc.get_value(key);
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;

      // Check if writable - key is writable if it has LLMWrite tag
      const isWritable = attributes?.systemTags?.includes('LLMWrite');

      const isDocument = attributes?.type === 'document';
      const sanitizedKey = AIToolBuilder.sanitizeKeyForTool(key);

      // Check for custom type
      const customTypeName = mc.getKeyType(key);
      const customType = customTypeName ? mc.getTypeSchema(customTypeName) : undefined;

      if (isWritable) {
        if (customType) {
          // Key with custom type - include schema in prompt
          const schemaInfo = SchemaParser.toMarkdown(customType);
          lines.push(
            `${key} (type: ${customTypeName}): ${displayValue}\n` +
            `Schema:\n${schemaInfo}\n` +
            `Tool: write_${sanitizedKey}`
          );
        } else if (isDocument) {
          lines.push(
            `${key}: ${displayValue}. ` +
                        `Document tools: write_${sanitizedKey}, append_${sanitizedKey}, edit_${sanitizedKey}`
          );
        } else {
          const oldValueHint = displayValue
            ? ' This tool DOES NOT append — start your response ' +
                        `with the old value (${displayValue})`
            : '';
          lines.push(
            `${key}: ${displayValue}. ` +
                        `You can rewrite "${key}" by using the write_${sanitizedKey} tool.${oldValueHint}`
          );
        }
      } else {
        if (customTypeName) {
          lines.push(`${key} (type: ${customTypeName}): ${displayValue}`);
        } else {
          lines.push(`${key}: ${displayValue}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
     * Execute a tool call by name with the given value.
     * Returns the result or null if tool not found.
     */
  static executeToolCall(
    mc: IAIToolBuildable,
    toolName: string,
    value: any
  ): { result: string; key: string; value?: any } | null {
    // Parse tool name (format: action_keyname)
    const match = toolName.match(/^(write|append|insert|edit)_(.+)$/);
    if (!match) {
      return null;
    }

    const [, action, sanitizedKey] = match;
    const key = AIToolBuilder.findKeyFromSanitizedTool(mc, sanitizedKey);

    if (!key) {
      return null;
    }

    const attributes = mc.get_attributes(key);
    if (!attributes) {
      return null;
    }

    // Check if writable - key is writable if it has LLMWrite tag
    const isWritable = attributes?.systemTags?.includes('LLMWrite');

    if (!isWritable) {
      return null;
    }

    const isDocument = attributes?.type === 'document';

    switch (action) {
      case 'write':
        if (isDocument) {
          mc._replaceDocumentText(key, value);
        } else {
          mc.set_value(key, value);
        }
        return {
          result: `Successfully wrote "${value}" to ${key}`,
          key,
          value
        };

      case 'append':
        if (isDocument) {
          const yText = mc.get_document(key);
          if (yText) {
            yText.insert(yText.length, value);
            return {
              result: `Successfully appended to ${key}`,
              key,
              value
            };
          }
        }
        return null;

      case 'insert':
        if (isDocument && typeof value === 'object' && value.index !== undefined && value.text) {
          mc.insert_text(key, value.index, value.text);
          return {
            result: `Successfully inserted at position ${value.index} in ${key}`,
            key,
            value: value.text
          };
        }
        return null;

      case 'edit':
        if (isDocument && typeof value === 'object' && value.find && value.replace !== undefined) {
          const yText = mc.get_document(key);
          if (yText) {
            const text = yText.toString();
            const idx = text.indexOf(value.find);
            if (idx !== -1) {
              yText.delete(idx, value.find.length);
              yText.insert(idx, value.replace);
              return {
                result: `Successfully replaced "${value.find}" with "${value.replace}" in ${key}`,
                key,
                value: value.replace
              };
            }
          }
        }
        return null;

      default:
        return null;
    }
  }
}
