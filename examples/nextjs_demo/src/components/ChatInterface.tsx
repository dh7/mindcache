'use client';

import { useChat, UIMessage } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls, DefaultChatTransport } from 'ai';
import { useEffect, useRef } from 'react';
import { MindCache } from 'mindcache';
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
  stmLoaded?: boolean; // Track STM loading state
  stmVersion?: number; // Track STM changes to refresh getTagged values
  systemPrompt?: string; // Custom system prompt (overrides default)
  mindcacheInstance?: MindCache; // Custom MindCache instance (for isolated STM)
}

export default function ChatInterface({ onToolCall, initialMessages, workflowPrompt, onWorkflowPromptSent, onStatusChange, stmLoaded, systemPrompt, mindcacheInstance }: ChatInterfaceProps) {
  // Use provided instance or create a default one (for backward compatibility)
  const defaultInstance = useRef(new MindCache());
  const mindcacheRef = mindcacheInstance || defaultInstance.current;
  
  // Analyze image tool function
  const analyzeImageWithSTM = async (prompt: string) => {
    try {
      console.log('🔍 Starting image analysis with STM integration');
      
      // Extract image references from prompt ({{image_name}})
      const imageRefMatches = prompt.match(/\{\{(\w+)\}\}/g);
      const imageRefs = imageRefMatches?.map(ref => ref.replace(/\{\{|\}\}/g, '')) || [];
      
      console.log('📝 Found image references:', imageRefs);
      
      // Only analyze images with explicit references
      let imagesToAnalyze: string[] = [];
      if (imageRefs.length === 0) {
        console.log('🚫 No explicit image references found');
        return {
          success: false,
          error: 'No explicit image references found. Please use {{image_name}} syntax to specify which image to analyze.'
        };
      } else {
        console.log('🎯 Using explicit image references:', imageRefs);
        imageRefs.forEach(ref => {
          const base64Data = mindcacheRef.get_base64(ref);
          if (base64Data) {
            imagesToAnalyze.push(base64Data);
            console.log(`✅ Found referenced image: ${ref}`);
          } else {
            console.warn(`❌ Referenced image not found: ${ref}`);
          }
        });
      }
      
      if (imagesToAnalyze.length === 0) {
        return {
          success: false,
          error: 'No images found to analyze. Make sure images are stored in STM and referenced correctly.'
        };
      }
      
      // Create FormData for the analysis API
      const formData = new FormData();
      
      // Convert first base64 to blob for the API
      const base64Data = imagesToAnalyze[0];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      formData.append('image', blob, 'image.jpg');
      formData.append('prompt', prompt);
      
      console.log('🚀 Calling image analysis API');
      const response = await fetch('/api/image-analysis', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          console.log('✅ Analysis completed:', { hasAnalysis: !!result.data.analysis });
          
          return {
            success: true,
            analysis: result.data.analysis,
            confidence: result.data.confidence,
            tags: result.data.tags,
            summary: result.data.summary,
            message: `Image analysis completed.`
          };
        } else {
          return {
            success: false,
            error: result.error || 'Analysis failed'
          };
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: errorData.error || `API error: ${response.status}`
        };
      }
    } catch (error) {
      console.error('❌ Image analysis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  };

  // Generate image tool function
  const generateImageWithImages = async (prompt: string, images: string[] = [], imageName?: string) => {
    try {
      const mode = images.length > 0 ? 'edit' : 'generate';
      
      console.log('🔍 generateImageWithImages called with:', { prompt, mode, imageCount: images.length, imageName });
      
      const requestBody: any = {
        prompt,
        mode,
        seed: -1,
      };

      if (mode === 'edit' && images.length > 0) {
        if (images.length === 1) {
          requestBody.imageBase64 = images[0];
        } else {
          requestBody.images = images;
        }
        requestBody.promptUpsampling = false;
        requestBody.safetyTolerance = 2;
      } else if (mode === 'generate') {
        requestBody.aspectRatio = "1:1";
      }

      console.log('📤 Sending request:', { 
        mode, 
        hasImages: images.length > 0, 
        imageCount: images.length,
        promptLength: prompt.length 
      });

      const response = await fetch('/api/image-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.startsWith('image/')) {
          const imageBlob = await response.blob();
          const requestId = response.headers.get('X-Request-ID');
          const responseMode = response.headers.get('X-Mode');
          const inputCount = parseInt(response.headers.get('X-Input-Count') || '0');
          
          // Convert blob to base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
          });
          
          // Store the generated image in mindcache
          const timestamp = Date.now();
          const imageKey = imageName || `generated_image_${timestamp}`;
          
          console.log('🖼️ Adding image to mindcache:', { imageKey, contentType, base64Length: base64Data.length, customName: !!imageName });
          mindcacheRef.add_image(imageKey, base64Data, contentType, {
            readonly: true,
            visible: true
          });
          
          const storedAttributes = mindcacheRef.get_attributes(imageKey);
          console.log('🔍 Stored attributes:', storedAttributes);

          return {
            success: true,
            imageKey,
            mode: responseMode || mode,
            inputCount,
            requestId,
            message: `Image ${mode === 'edit' ? 'edited' : 'generated'} successfully and stored as '${imageKey}'`
          };
        } else {
          const result = await response.json();
          return {
            success: false,
            error: result.error || 'Unknown error occurred'
          };
        }
      } else {
        try {
          const result = await response.json();
          return {
            success: false,
            error: result.error || `HTTP ${response.status}: ${response.statusText}`
          };
        } catch {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
  
  // Generate tool schemas (without execute functions) for the server
  function getToolSchemas(): Record<string, ToolSchema> {
    const tools = mindcacheRef.get_aisdk_tools();
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
          let finalSystemPrompt;
          
          // Priority: custom systemPrompt prop > STM tagged > default from mindcache
          if (systemPrompt) {
            finalSystemPrompt = systemPrompt;
          } else if (stmLoaded) {
            const systemPromptTagged = mindcacheRef.getTagged("SystemPrompt");
            finalSystemPrompt = systemPromptTagged 
              ? systemPromptTagged.split(': ').slice(1).join(': ') // Extract value part after "key: "
              : mindcacheRef.get_system_prompt();
          } else {
            finalSystemPrompt = mindcacheRef.get_system_prompt();
          }
          
          const nextBody = { ...originalBody, toolSchemas: getToolSchemas(), systemPrompt: finalSystemPrompt };
          console.log('📤 Sending to server:', { toolSchemas: Object.keys(nextBody.toolSchemas || {}), hasSystemPrompt: Boolean(finalSystemPrompt) });
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
        const result = mindcacheRef.executeToolCall(toolName, value);
        
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
        const { prompt, imageName } = typedToolCall.input as { prompt: string; imageName?: string };
        
        // Extract explicit image references from prompt ({{image_name}})
        const imageRefMatches = prompt.match(/\{\{(\w+)\}\}/g);
        const explicitImageRefs = imageRefMatches?.map(ref => ref.replace(/\{\{|\}\}/g, '')) || [];
        
        console.log('📝 Found explicit image references:', explicitImageRefs);
        
        let imagesToInclude: string[] = [];
        
        if (explicitImageRefs.length > 0) {
          // Get specific referenced images
          console.log('🎯 Using explicit image references:', explicitImageRefs);
          explicitImageRefs.forEach(ref => {
            const base64Data = mindcacheRef.get_base64(ref);
            if (base64Data) {
              imagesToInclude.push(base64Data);
              console.log(`✅ Found referenced image: ${ref}`);
            } else {
              console.warn(`❌ Referenced image not found: ${ref}`);
            }
          });
        }
        
        console.log(`🎯 Images to include: ${imagesToInclude.length}`);
        
        const result = await generateImageWithImages(prompt, imagesToInclude, imageName);
        console.log('🖼️ Image generation result:', result);
        
        // Notify parent if callback exists
        if (onToolCall) {
          onToolCall(typedToolCall);
        }
        
        addToolResult({
          tool: toolName,
          toolCallId: typedToolCall.toolCallId,
          output: result
        });
        return;
      }

      // Handle analyze_image tool
      if (toolName === 'analyze_image') {
        console.log('🔍 Handling analyze_image tool call');
        const { prompt } = typedToolCall.input as { prompt: string; analysisName?: string };
        
        const result = await analyzeImageWithSTM(prompt);
        console.log('🔍 Image analysis result:', result);
        
        // Notify parent if callback exists
        if (onToolCall) {
          onToolCall(typedToolCall);
        }
        
        addToolResult({
          tool: toolName,
          toolCallId: typedToolCall.toolCallId,
          output: result
        });
        return;
      }

      // Handle generate_mermaid_diagram tool
      if (toolName === 'generate_mermaid_diagram') {
        console.log('📊 Handling generate_mermaid_diagram tool call');
        const { mermaidCode, imageName } = typedToolCall.input as { 
          mermaidCode: string; 
          imageName?: string;
        };
        
        try {
          const response = await fetch('/api/mermaid-to-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mermaidCode })
          });

          if (response.ok) {
            const imageBlob = await response.blob();
            
            // Convert blob to base64
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(imageBlob);
            });
            
            // Store the diagram in mindcache
            const timestamp = Date.now();
            const imageKey = imageName || `diagram_${timestamp}`;
            
            console.log('📊 Adding diagram to mindcache:', { imageKey, base64Length: base64Data.length });
            mindcacheRef.add_image(imageKey, base64Data, 'image/png', {
              readonly: true,
              visible: true
            });
            
            const result = {
              success: true,
              imageKey,
              message: `Diagram generated successfully and stored as '${imageKey}'`
            };
            
            // Notify parent if callback exists
            if (onToolCall) {
              onToolCall(typedToolCall);
            }
            
            addToolResult({
              tool: toolName,
              toolCallId: typedToolCall.toolCallId,
              output: result
            });
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            const result = {
              success: false,
              error: errorData.error || `API error: ${response.status}`
            };
            
            addToolResult({
              tool: toolName,
              toolCallId: typedToolCall.toolCallId,
              output: result
            });
          }
        } catch (error) {
          console.error('❌ Mermaid diagram generation error:', error);
          const result = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          };
          
          addToolResult({
            tool: toolName,
            toolCallId: typedToolCall.toolCallId,
            output: result
          });
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
      // Process the workflow prompt through injectSTM
      const processedPrompt = mindcacheRef.injectSTM(workflowPrompt);
      // Send the workflow prompt with original text for display, processed text in metadata
      sendMessage({
        role: 'user',
        parts: [{ type: 'text' as const, text: workflowPrompt }], // Original text with {{key}} for display
        metadata: { processedText: processedPrompt } // Processed text for LLM
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
      
      <ChatInput 
        onSendMessage={sendMessage}
        status={status}
        mindcacheInstance={mindcacheRef}
      />
    </div>
  );
}
