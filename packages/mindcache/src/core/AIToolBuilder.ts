/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import { tool } from 'ai';
import { z } from 'zod';
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
    has(key: string): boolean;

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
    getRegisteredTypes(): string[];
    setType(key: string, typeName: string): void;
}

/**
 * Builds AI SDK compatible tools and system prompts from MindCache data.
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
   * Generate framework-agnostic tools with raw JSON Schema.
   * Works with: OpenAI SDK, Anthropic SDK, LangChain, etc.
   *
   * Tool format:
   * {
   *   description: string,
   *   parameters: { type: 'object', properties: {...}, required: [...] },
   *   execute: async (args) => result
   * }
   */
  static createTools(mc: IAIToolBuildable): Record<string, any> {
    return AIToolBuilder._buildTools(mc);
  }

  /**
   * Generate Vercel AI SDK v5 compatible tools using Zod schemas.
   * Uses tool() helper with Zod for full AI SDK v5 compatibility.
   *
   * Use this with: generateText(), streamText() from 'ai' package
   */
  static createVercelAITools(mc: IAIToolBuildable): Record<string, any> {
    const tools: Record<string, any> = {};
    const registeredTypes = mc.getRegisteredTypes();
    const typeDesc = registeredTypes.length > 0
      ? `Optional type: ${registeredTypes.join(' | ')}`
      : 'No types registered';

    // create_key tool with Zod schema
    tools['create_key'] = tool({
      description: `Create a new key in MindCache. ${registeredTypes.length > 0 ? `Available types: ${registeredTypes.join(', ')}` : ''}`,
      inputSchema: z.object({
        key: z.string().describe('The key name (e.g., "contact_john_doe")'),
        value: z.string().describe('The value (JSON string for structured data)'),
        type: z.string().optional().describe(typeDesc)
      }),
      execute: async ({ key, value, type }: { key: string; value: string; type?: string }) => {
        if (mc.has(key)) {
          return { result: `Key "${key}" exists. Use write_${AIToolBuilder.sanitizeKeyForTool(key)}`, error: true };
        }
        if (type && !mc.getTypeSchema(type)) {
          return { result: `Type "${type}" not registered`, error: true };
        }
        mc.set_value(key, value, { systemTags: ['SystemPrompt', 'LLMRead', 'LLMWrite'] });
        if (type) {
          mc.setType(key, type);
        }
        return { result: `Created "${key}"${type ? ` (${type})` : ''}`, key, value };
      }
    });

    // Add write_ tools for existing writable keys
    for (const key of mc.keys()) {
      if (key.startsWith('$') || !mc.keyMatchesContext(key)) {
        continue;
      }
      const attrs = mc.get_attributes(key);
      if (!attrs?.systemTags?.includes('LLMWrite')) {
        continue;
      }

      const sanitized = AIToolBuilder.sanitizeKeyForTool(key);
      const customTypeName = mc.getKeyType(key);
      const customType = customTypeName ? mc.getTypeSchema(customTypeName) : undefined;

      let desc = `Write to "${key}"`;
      if (customType) {
        desc = `Write to "${key}" (${customTypeName}). ${SchemaParser.toPromptDescription(customType)}`;
      }

      tools[`write_${sanitized}`] = tool({
        description: desc,
        inputSchema: z.object({
          value: z.string().describe(customType ? `JSON following ${customTypeName} schema` : 'Value to write')
        }),
        execute: async ({ value }: { value: string }) => {
          const success = mc.llm_set_key(key, value);
          return success
            ? { result: `Wrote to ${key}`, key, value }
            : { result: `Failed to write to ${key}`, error: true };
        }
      });

      // Document tools
      if (attrs?.type === 'document') {
        tools[`append_${sanitized}`] = tool({
          description: `Append to "${key}" document`,
          inputSchema: z.object({ text: z.string().describe('Text to append') }),
          execute: async ({ text }: { text: string }) => {
            const yText = mc.get_document(key);
            if (yText) {
              yText.insert(yText.length, text); return { result: 'Appended', key };
            }
            return { result: 'Not found', error: true };
          }
        });

        tools[`insert_${sanitized}`] = tool({
          description: `Insert text at position in "${key}" document`,
          inputSchema: z.object({
            index: z.number().describe('Position (0 = start)'),
            text: z.string().describe('Text to insert')
          }),
          execute: async ({ index, text }: { index: number; text: string }) => {
            mc.insert_text(key, index, text);
            return { result: `Inserted at ${index}`, key };
          }
        });

        tools[`edit_${sanitized}`] = tool({
          description: `Find and replace in "${key}" document`,
          inputSchema: z.object({
            find: z.string().describe('Text to find'),
            replace: z.string().describe('Replacement')
          }),
          execute: async ({ find, replace }: { find: string; replace: string }) => {
            const yText = mc.get_document(key);
            if (yText) {
              const text = yText.toString();
              const idx = text.indexOf(find);
              if (idx !== -1) {
                yText.delete(idx, find.length);
                yText.insert(idx, replace);
                return { result: `Replaced "${find}"`, key };
              }
              return { result: `"${find}" not found`, error: true };
            }
            return { result: 'Document not found', error: true };
          }
        });
      }
    }

    return tools;
  }

  /**
   * Internal: Build tools with raw JSON Schema (framework-agnostic).
   */
  private static _buildTools(mc: IAIToolBuildable): Record<string, any> {
    const tools: Record<string, any> = {};

    // Add create_key tool for creating new keys
    const registeredTypes = mc.getRegisteredTypes();
    const typeInfo = registeredTypes.length > 0
      ? `Available types: ${registeredTypes.join(', ')}`
      : 'No custom types registered';

    tools['create_key'] = {
      description: `Create a new key in MindCache. ${typeInfo}. The new key will be readable and writable by the LLM.`,
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The key name to create (e.g., "contact_john_doe")' },
          value: { type: 'string', description: 'The value to store (use JSON string for structured data)' },
          type: {
            type: 'string',
            description: registeredTypes.length > 0
              ? `Optional: custom type name (${registeredTypes.join(' | ')})`
              : 'Optional: custom type name (none registered)'
          }
        },
        required: ['key', 'value']
      },
      execute: async ({ key, value, type }: { key: string; value: string; type?: string }) => {
        // Check if key already exists
        if (mc.has(key)) {
          return {
            result: `Key "${key}" already exists. Use write_${AIToolBuilder.sanitizeKeyForTool(key)} to update it.`,
            key,
            error: true
          };
        }

        // Validate type if provided
        if (type && !mc.getTypeSchema(type)) {
          return {
            result: `Type "${type}" is not registered. Available types: ${registeredTypes.join(', ') || 'none'}`,
            key,
            error: true
          };
        }

        // Create the key with LLM permissions
        mc.set_value(key, value, {
          systemTags: ['SystemPrompt', 'LLMRead', 'LLMWrite']
        });

        // Set type if provided
        if (type) {
          mc.setType(key, type);
        }

        return {
          result: `Successfully created key "${key}"${type ? ` with type "${type}"` : ''}`,
          key,
          value,
          type
        };
      }
    };

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
        parameters: {
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
          parameters: {
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
          parameters: {
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
          parameters: {
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

    // Add info about create_key tool and registered types
    const registeredTypes = mc.getRegisteredTypes();
    if (registeredTypes.length > 0) {
      lines.push(`[create_key tool available - registered types: ${registeredTypes.join(', ')}]`);
      lines.push('');
    }

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
