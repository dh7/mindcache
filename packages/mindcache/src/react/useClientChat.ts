'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamText, stepCountIs } from 'ai';
import type { MindCache } from '../core/MindCache';
import { useMindCacheContext } from './MindCacheContext';

/**
 * Message part types (compatible with AI SDK UIMessage)
 */
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

/**
 * Chat message structure (compatible with AI SDK UIMessage)
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: MessagePart[];
  createdAt: Date;
}

/**
 * Chat status
 */
export type ChatStatus = 'idle' | 'loading' | 'streaming' | 'error';

/**
 * useClientChat options
 */
export interface UseClientChatOptions {
  /** MindCache instance (uses context if not provided) */
  mindcache?: MindCache;
  /** Initial messages */
  initialMessages?: ChatMessage[];
  /** Custom system prompt (overrides MindCache system prompt) */
  systemPrompt?: string;
  /** Callback when AI modifies MindCache */
  onMindCacheChange?: () => void;
  /** Callback when message is complete */
  onFinish?: (message: ChatMessage) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Max tool call iterations (default: 5) */
  maxToolCalls?: number;
}

/**
 * useClientChat return value
 */
export interface UseClientChatReturn {
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Current status */
  status: ChatStatus;
  /** Current error if any */
  error: Error | null;
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
  /** Clear all messages */
  clearMessages: () => void;
  /** Whether currently loading/streaming */
  isLoading: boolean;
  /** Add a message programmatically */
  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => void;
  /** Stop the current generation */
  stop: () => void;
  /** Current streaming text (updates in real-time) */
  streamingContent: string;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * useClientChat - Client-side AI chat hook with real-time streaming
 *
 * Runs AI entirely in the browser using the Vercel AI SDK.
 * Automatically integrates with MindCache for context and tool execution.
 * Shows text streaming in real-time as it's generated.
 *
 * @example
 * ```tsx
 * function Chat() {
 *   const { messages, sendMessage, isLoading, streamingContent } = useClientChat();
 *
 *   return (
 *     <div>
 *       {messages.map(m => <div key={m.id}>{m.content}</div>)}
 *       {streamingContent && <div>{streamingContent}</div>}
 *       <input onSubmit={e => sendMessage(e.target.value)} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useClientChat(options: UseClientChatOptions = {}): UseClientChatReturn {
  const context = useMindCacheContext();
  const mc = options.mindcache || context.mindcache;

  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages || []);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    systemPrompt,
    onMindCacheChange,
    onFinish,
    onError,
    maxToolCalls = 5
  } = options;

  // Get API key from context
  const apiKey = context.getApiKey();

  // Add message helper
  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const newMessage: ChatMessage = {
      ...msg,
      id: generateId(),
      createdAt: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStreamingContent('');
  }, []);

  // Stop generation
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('idle');
  }, []);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!mc) {
      const err = new Error('MindCache not initialized');
      setError(err);
      onError?.(err);
      return;
    }

    if (!apiKey) {
      const err = new Error('API key not configured. Please set your API key.');
      setError(err);
      onError?.(err);
      return;
    }

    // Cancel any ongoing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Add user message
    const userMessage = addMessage({ role: 'user', content });
    setStatus('loading');
    setError(null);
    setStreamingContent('');

    // Track accumulated text for abort handling
    let accumulatedText = '';

    try {
      // Get model from context (handles provider config automatically)
      const model = context.getModel();

      // Get system prompt and tools from MindCache
      const finalSystemPrompt = systemPrompt || mc.get_system_prompt();
      const tools = mc.create_vercel_ai_tools();

      // Build messages for API
      const apiMessages = messages.concat(userMessage).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }));

      setStatus('streaming');

      // Accumulated parts for the final message
      const parts: MessagePart[] = [];

      // Stream the response with real-time updates
      const result = await streamText({
        model,
        system: finalSystemPrompt,
        messages: apiMessages,
        tools,
        stopWhen: stepCountIs(maxToolCalls),
        abortSignal: abortControllerRef.current.signal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onStepFinish: async (step: any) => {
          // Handle tool calls
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              const toolName = toolCall.toolName;
              const args = (toolCall.args || toolCall.input || {}) as Record<string, unknown>;

              // Add tool call part
              parts.push({
                type: 'tool-call',
                toolCallId: toolCall.toolCallId,
                toolName,
                args
              });

              // Execute tool on MindCache
              if (typeof toolName === 'string' && (toolName.startsWith('write_') || toolName === 'create_key')) {
                const value = args.value as string;
                const result = mc.executeToolCall(toolName, value);

                // Add tool result part
                parts.push({
                  type: 'tool-result',
                  toolCallId: toolCall.toolCallId,
                  toolName,
                  result
                });

                onMindCacheChange?.();
              }
            }
          }
          // Note: Don't accumulate step.text here - it's already in textStream
        }
      });

      // Stream text chunks to UI in real-time
      for await (const chunk of result.textStream) {
        accumulatedText += chunk;
        setStreamingContent(accumulatedText);
      }

      // Get final text from result (authoritative, avoids any streaming duplication)
      const finalText = await result.text;

      // Build final message with parts
      if (finalText) {
        parts.unshift({ type: 'text', text: finalText });
      }

      // Add assistant message with all parts
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: finalText,
        parts: parts.length > 0 ? parts : undefined,
        createdAt: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
      setStatus('idle');
      onFinish?.(assistantMessage);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isAborted = (err as Error).name === 'AbortError' ||
                        errorMessage.includes('aborted') ||
                        errorMessage.includes('No output generated');

      if (isAborted) {
        // If we have partial content from streaming, save it
        if (accumulatedText) {
          const partialMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: accumulatedText + ' [stopped]',
            createdAt: new Date()
          };
          setMessages(prev => [...prev, partialMessage]);
        }
        setStreamingContent('');
        setStatus('idle');
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setStatus('error');
      setStreamingContent('');
      onError?.(error);
    }
  }, [
    mc, apiKey, context, messages, systemPrompt,
    maxToolCalls, addMessage, onMindCacheChange, onFinish, onError, streamingContent
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    messages,
    status,
    error,
    sendMessage,
    clearMessages,
    isLoading: status === 'loading' || status === 'streaming',
    addMessage,
    stop,
    streamingContent
  };
}
