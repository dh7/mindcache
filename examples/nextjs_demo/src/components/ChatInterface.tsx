'use client';

import { useChat, UIMessage } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, DefaultChatTransport } from 'ai';
import { useRef, useEffect } from 'react';
import { mindcache } from 'mindcache';
import ChatConversation from './ChatConversation';
import ChatInput from './ChatInput';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

interface ToolSchema {
  description: string;
}

interface MessagePart {
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  output?: unknown;
  result?: unknown;
  // File part properties
  mediaType?: string;
  url?: string;
  filename?: string;
}

interface Message {
  id: string;
  role: string;
  parts?: MessagePart[];
}

interface WebSearchSource {
  url: string;
  title?: string;
  snippet?: string;
}

interface ChatInterfaceProps {
  onToolCall?: (toolCall: TypedToolCall<ToolSet>) => Promise<any> | void;
  initialMessages?: UIMessage[];
  workflowPrompt?: string;
  onWorkflowPromptSent?: () => void;
  onStatusChange?: (status: string) => void;
  children?: React.ReactNode; // Allow children to be inserted between conversation and input
}

export default function ChatInterface({ onToolCall, initialMessages, workflowPrompt, onWorkflowPromptSent, onStatusChange, children }: ChatInterfaceProps) {
  const mindcacheRef = useRef(mindcache);
  
  
  // Generate tool schemas (without execute functions) for the server
  function getToolSchemas(): Record<string, ToolSchema> {
    const tools = mindcacheRef.current.get_aisdk_tools();
    const schemas: Record<string, ToolSchema> = {};
    
    console.log('🔧 Generated tools on client:', Object.keys(tools));
    
    // Convert tools to schema-only format
    Object.entries(tools).forEach(([toolName, tool]: [string, { description: string }]) => {
      schemas[toolName] = {
        description: tool.description,
        // Server will recreate the Zod schema
      };
    });


    console.log('📤 Sending tool schemas to server:', Object.keys(schemas));
    return schemas;
  }

  const { messages, sendMessage, status, addToolResult } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat-client-stm',
      fetch: async (input, init) => {
        try {
          const originalBody = init?.body ? JSON.parse(init.body as string) : {};
          const systemPrompt = mindcacheRef.current.get_system_prompt();
          const nextBody = { ...originalBody, toolSchemas: getToolSchemas(), systemPrompt };
          console.log('📤 Sending to server:', { toolSchemas: Object.keys(nextBody.toolSchemas || {}), hasSystemPrompt: Boolean(systemPrompt) });
          return fetch(input, { ...init, body: JSON.stringify(nextBody) });
        } catch {
          return fetch(input, init);
        }
      },
    }),
    // Auto-submit when all tool calls are complete
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message }) => {
      console.log('🏁 Message finished:', message);
      console.log('🏁 Message parts:', (message as Message).parts);
      
      // Extract and log sources from web search results
      const parts = (message as Message).parts || [];
      const toolResults = parts.filter((part: MessagePart) => part.type === 'tool-result');
      const webSearchResults = toolResults.filter((result: MessagePart) => 
        result.toolName === 'web_search' && (result.result as { sources?: WebSearchSource[] })?.sources
      );
      
      if (webSearchResults.length > 0) {
        console.log('🔍 Web search sources:', webSearchResults.map((r: MessagePart) => (r.result as { sources: WebSearchSource[] }).sources));
      }
    },
    async onToolCall({ toolCall }) {
       console.log('🔧 Client intercepted tool call:', toolCall);
       const typedToolCall = toolCall as TypedToolCall<ToolSet>;
       const toolName = typedToolCall.toolName;
       const toolInput = typedToolCall.input;

       console.log('🔧 Extracted:', { toolName, toolInput });
      
      // Execute tools client-side to maintain STM state
      if (typeof toolName === 'string' && toolName.startsWith('write_')) {
        const value = (toolInput as Record<string, unknown>)?.value as string;
        
        // Execute the tool call using the centralized method
        const result = mindcacheRef.current.executeToolCall(toolName, value);
        
        // Notify parent component of tool call
        if (onToolCall) {
          onToolCall(typedToolCall);
        }
        
        // v5 API: add tool result with 'output'
        if (result) {
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
        } else {
          console.warn('Failed to execute tool call:', toolName);
        }
        return;
      }

      // Handle generate_image tool
      if (toolName === 'generate_image') {
        console.log('🖼️ Handling generate_image tool call');
        
        // Notify parent component and get result
        if (onToolCall) {
          const result = await onToolCall(typedToolCall);
          
          // Add tool result
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
        } else {
          console.warn('No onToolCall handler for generate_image');
        }
        return;
      }

      // Handle analyze_image tool
      if (toolName === 'analyze_image') {
        console.log('🔍 Handling analyze_image tool call');
        
        // Notify parent component and get result
        if (onToolCall) {
          const result = await onToolCall(typedToolCall);
          
          // Add tool result
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
        } else {
          console.warn('No onToolCall handler for analyze_image');
        }
        return;
      }

      // Handle other potential tools
      console.warn('Unknown tool:', toolName);
    }
  });


  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // Handle workflow prompts
  useEffect(() => {
    if (workflowPrompt && status === 'ready') {
      // Send the workflow prompt (without automatic image attachment)
      sendMessage({
        role: 'user',
        parts: [{ type: 'text' as const, text: workflowPrompt }]
      });
      
      // Immediately notify that the prompt was sent to clear the workflowPrompt
      if (onWorkflowPromptSent) {
        onWorkflowPromptSent();
      }
    }
  }, [workflowPrompt, status, sendMessage, onWorkflowPromptSent]);


  return (
    <div className="flex-1 flex flex-col pr-1 min-h-0">
      <ChatConversation messages={messages} />
      
      {/* Allow children to be inserted between conversation and input */}
      {children}
      
      <ChatInput 
        onSendMessage={sendMessage}
        status={status}
      />
    </div>
  );
}
