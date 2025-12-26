/**
 * Chat API Handler
 *
 * Provides AI chat with MindCache-aware tools:
 * - Read keys from the instance
 * - Write keys to the instance
 * - Uses SystemPrompt-tagged keys for context
 *
 * Two modes:
 * - Edit mode: Can modify all keys including system prompt keys
 * - Use mode: Can only modify keys with LLMWrite tag
 */

import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages, UIMessage } from 'ai';
import { z } from 'zod';
import { KeyAttributes, KeyEntry, DEFAULT_KEY_ATTRIBUTES, SystemTagHelpers } from '@mindcache/shared';

export interface ChatEnv {
  OPENAI_API_KEY?: string;
  // eslint-disable-next-line no-undef
  MINDCACHE_INSTANCE: DurableObjectNamespace;
}

export interface ChatRequest {
  messages: UIMessage[];
  instanceId: string;
  mode: 'edit' | 'use';
  model?: string;
}

interface InstanceData {
  [key: string]: KeyEntry;
}

/**
 * Fetch current instance data directly from the Durable Object via HTTP
 */
async function fetchInstanceData(
  env: ChatEnv,
  instanceId: string
): Promise<InstanceData> {
  const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
  const stub = env.MINDCACHE_INSTANCE.get(id);

  // Use internal HTTP endpoint to get all keys
  const response = await stub.fetch(new Request('http://internal/keys'));
  if (!response.ok) {
    throw new Error('Failed to fetch instance data');
  }
  return response.json();
}

/**
 * Set a key in the Durable Object via HTTP
 */
async function setInstanceKey(
  env: ChatEnv,
  instanceId: string,
  key: string,
  value: unknown,
  attributes: KeyAttributes
): Promise<void> {
  const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
  const stub = env.MINDCACHE_INSTANCE.get(id);

  const response = await stub.fetch(new Request('http://internal/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, attributes })
  }));

  if (!response.ok) {
    throw new Error('Failed to set key');
  }
}

/**
 * Delete a key from the Durable Object via HTTP
 */
async function deleteInstanceKey(
  env: ChatEnv,
  instanceId: string,
  key: string
): Promise<void> {
  const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
  const stub = env.MINDCACHE_INSTANCE.get(id);

  const response = await stub.fetch(new Request(`http://internal/keys/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  }));

  if (!response.ok) {
    throw new Error('Failed to delete key');
  }
}

/**
 * Build system prompt from keys tagged with 'SystemPrompt' or 'LLMRead'
 */
function buildSystemPrompt(data: InstanceData): string {
  const systemPromptParts: string[] = [
    'You are an AI assistant with access to a MindCache instance. You can read, write, and delete keys.',
    '',
    'IMPORTANT RULES:',
    '1. When the user provides information, use write_key to save it to the EXISTING key that matches. For example: "my name is Alice" → write_key(key="name", value="Alice")',
    '2. Use the EXACT key names listed below. Do NOT create new keys like "user_name" when "name" already exists.',
    '3. Always update keys proactively when the user shares relevant information.',
    '',
    '## Current Context',
    ''
  ];

  // Add keys that are readable by LLM (SystemPrompt or LLMRead)
  for (const [key, entry] of Object.entries(data)) {
    if (SystemTagHelpers.isLLMReadable(entry.attributes)) {
      const value = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value, null, 2);
      systemPromptParts.push(`### ${key}`);
      systemPromptParts.push(value);
      systemPromptParts.push('');
    }
  }

  // Add summary of available keys
  systemPromptParts.push('## Available Keys');
  systemPromptParts.push('');

  for (const [key, entry] of Object.entries(data)) {
    const tags = entry.attributes.contentTags.join(', ');
    const isWritable = SystemTagHelpers.isLLMWritable(entry.attributes);
    const readonly = isWritable ? '' : ' (readonly)';
    systemPromptParts.push(`- **${key}**${readonly}: ${entry.attributes.type}${tags ? ` [${tags}]` : ''}`);
  }

  return systemPromptParts.join('\n');
}

/**
 * Create MindCache tools for the AI
 */
function createMindCacheTools(
  env: ChatEnv,
  instanceId: string,
  mode: 'edit' | 'use'
) {
  return {
    read_key: tool({
      description: 'Read the value of a key from MindCache',
      inputSchema: z.object({
        key: z.string().describe('The key name to read')
      }),
      execute: async ({ key }) => {
        // Refresh data to get latest
        const data = await fetchInstanceData(env, instanceId);
        const entry = data[key];
        if (!entry) {
          return { error: `Key "${key}" not found` };
        }
        return {
          key,
          value: entry.value,
          type: entry.attributes.type,
          tags: entry.attributes.contentTags,
          writable: SystemTagHelpers.isLLMWritable(entry.attributes)
        };
      }
    }),

    write_key: tool({
      description: 'Write or update a key in MindCache. Creates the key if it does not exist. When updating an existing key, the type is preserved unless explicitly changed.',
      inputSchema: z.object({
        key: z.string().describe('The key name to write'),
        value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown()), z.array(z.unknown())])
          .describe('The value to store'),
        type: z.enum(['text', 'json', 'document', 'image', 'file']).optional()
          .describe('Value type. Only specify when creating a new key or explicitly changing the type. For existing keys, the type is preserved by default.'),
        tags: z.array(z.string()).optional().describe('Content tags to apply to the key')
      }),
      execute: async ({ key, value, type, tags }) => {
        // Refresh data to check current state
        const data = await fetchInstanceData(env, instanceId);
        const existing = data[key];

        // In "use" mode, can't write to keys without LLMWrite tag
        if (mode === 'use' && existing) {
          if (!SystemTagHelpers.isLLMWritable(existing.attributes)) {
            return { error: `Key "${key}" is not writable (missing LLMWrite tag)` };
          }
          if (SystemTagHelpers.isInSystemPrompt(existing.attributes)) {
            return { error: `Key "${key}" is a system prompt key and cannot be modified in use mode` };
          }
        }

        // For existing keys, preserve attributes and only update what's specified
        // For new keys, use defaults
        const attributes: KeyAttributes = existing?.attributes || {
          ...DEFAULT_KEY_ATTRIBUTES,
          type: type || 'text',
          contentTags: tags || []
        };

        // Only update type if explicitly provided for a new key or type change
        if (type && !existing) {
          attributes.type = type;
        } else if (type && existing && type !== existing.attributes.type) {
          attributes.type = type;
        }
        // Otherwise, preserve the existing type

        if (tags) {
          attributes.contentTags = tags;
        }

        await setInstanceKey(env, instanceId, key, value, attributes);
        return { success: true, key, value };
      }
    }),

    delete_key: tool({
      description: 'Delete a key from MindCache',
      inputSchema: z.object({
        key: z.string().describe('The key name to delete')
      }),
      execute: async ({ key }) => {
        const data = await fetchInstanceData(env, instanceId);
        const existing = data[key];

        if (!existing) {
          return { error: `Key "${key}" not found` };
        }

        // In "use" mode, can't delete protected or system prompt keys
        if (mode === 'use') {
          if (!SystemTagHelpers.isLLMWritable(existing.attributes)) {
            return { error: `Key "${key}" is not writable (missing LLMWrite tag)` };
          }
          if (SystemTagHelpers.isProtected(existing.attributes)) {
            return { error: `Key "${key}" is protected and cannot be deleted` };
          }
          if (SystemTagHelpers.isInSystemPrompt(existing.attributes)) {
            return { error: `Key "${key}" is a system prompt key and cannot be deleted in use mode` };
          }
        }

        await deleteInstanceKey(env, instanceId, key);
        return { success: true, key };
      }
    }),

    list_keys: tool({
      description: 'List all keys in MindCache with their types and tags',
      inputSchema: z.object({
        tag: z.string().optional().describe('Filter by content tag')
      }),
      execute: async ({ tag }) => {
        const data = await fetchInstanceData(env, instanceId);

        let keys = Object.entries(data).map(([key, entry]) => ({
          key,
          type: entry.attributes.type,
          tags: entry.attributes.contentTags,
          writable: SystemTagHelpers.isLLMWritable(entry.attributes)
        }));

        if (tag) {
          keys = keys.filter(k => k.tags.includes(tag));
        }

        return { keys };
      }
    })
  };
}

/**
 * Handle chat request with streaming response
 */
export async function handleChatRequest(
  request: Request,
  env: ChatEnv
): Promise<Response> {
  try {
    const body = await request.json() as ChatRequest;
    const { messages, instanceId, mode = 'use', model = 'gpt-4o' } = body;

    // Validate required fields first
    if (!instanceId) {
      return Response.json({ error: 'instanceId required' }, { status: 400 });
    }

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages array required' }, { status: 400 });
    }

    // Then check API key
    if (!env.OPENAI_API_KEY) {
      return Response.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Fetch current instance data
    const instanceData = await fetchInstanceData(env, instanceId);

    // Build system prompt from SystemPrompt-tagged keys
    const systemPrompt = buildSystemPrompt(instanceData);

    // Create OpenAI provider
    const openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY
    });

    // Create tools
    const tools = createMindCacheTools(env, instanceId, mode);

    // Convert UIMessage format to CoreMessage format for the model
    const modelMessages = convertToModelMessages(messages);

    // Stream the response
    const result = streamText({
      model: openai(model),
      system: systemPrompt,
      messages: modelMessages,
      tools
      // Note: maxSteps not available in this AI SDK version
      // Multi-step tool calls are supported by default
    });

    // Return streaming response in UI message format for @ai-sdk/react
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat error:', error);
    return Response.json(
      { error: 'Chat failed', details: String(error) },
      { status: 500 }
    );
  }
}
