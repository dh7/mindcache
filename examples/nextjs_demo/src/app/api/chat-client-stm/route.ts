import { NextRequest } from 'next/server';
import { streamText, tool, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export const POST = async (req: NextRequest) => {
  console.log('🤖 Chat API called');
  const { messages, toolSchemas, systemPrompt }: {
    messages: UIMessage[];
    toolSchemas?: Record<string, { description: string }>;
    systemPrompt?: string;
  } = await req.json();
  
  console.log('📨 Request details:', {
    messageCount: messages.length,
    toolSchemaCount: Object.keys(toolSchemas || {}).length,
    toolNames: Object.keys(toolSchemas || {}),
    hasSystemPrompt: !!systemPrompt,
    lastMessageRole: messages[messages.length - 1]?.role,
    lastMessagePreview: (messages[messages.length - 1]?.parts?.[0] as any)?.text?.substring(0, 100) + '...'
  });

  // Convert client tool schemas to server tool definitions (schema only, no execute)
  const serverTools: Record<string, unknown> = {};
  
  // Add generate_image tool directly on server
  serverTools['generate_image'] = tool({
    description: 'REQUIRED for ALL image tasks: Generate new images or edit existing images using AI. Only includes existing images when explicitly referenced with @image_name syntax. Without explicit references, generates completely new images. Use the optional imageName parameter to specify a custom name for storing the image in the STM (Short Term Memory).',
    inputSchema: z.object({
      prompt: z.string().describe('The prompt for image generation or editing. Use @image_name to reference specific images for editing (e.g., "Edit @my_image to be brighter"). Without explicit references, generates new images.'),
      imageName: z.string().optional().describe('Optional name for the generated/edited image to store in the STM (Short Term Memory)')
    }),
    // NO execute function - this forces client-side execution via onToolCall
  });

  // Add analyze_image tool directly on server
  serverTools['analyze_image'] = tool({
    description: 'Analyze specific images stored in STM (Short Term Memory) using AI vision. REQUIRES explicit @image_name references in the prompt - will not analyze visible images automatically. The analysis result will be stored back in STM for future reference.',
    inputSchema: z.object({
      prompt: z.string().describe('The analysis prompt. MUST include @image_name to reference specific images from STM (e.g., "Analyze @generated_image_1 and describe the colors"). Will fail if no explicit image references are provided.'),
      analysisName: z.string().optional().describe('Optional name for storing the analysis result in STM (defaults to analysis_timestamp)')
    }),
    // NO execute function - this forces client-side execution via onToolCall
  });
  
  if (toolSchemas && typeof toolSchemas === 'object') {
    console.log('🔧 Processing tool schemas:', Object.keys(toolSchemas));
    Object.entries(toolSchemas).forEach(([toolName, schema]: [string, { description: string }]) => {
      // Skip generate_image since it's now defined directly above
      if (toolName === 'generate_image') {
        console.log('🖼️ Skipping generate_image - defined directly on server');
        return;
      }
      
      console.log(`📝 Setting up write tool: ${toolName}`);
      // Default schema for write_ tools
      serverTools[toolName] = tool({
        description: schema.description,
        inputSchema: z.object({
          value: z.string().describe(`The value to write to ${toolName.replace('write_', '')}`)
        }),
        // NO execute function - this forces client-side execution via onToolCall
      });
    });
  }

  // Build the final system prompt, optionally combining client-provided content
  const baseInstructions = `Here are some facts and instructions for you to follow.

IMPORTANT IMAGE HANDLING RULES:
- When users ask to edit, modify, change, or update images, use the generate_image tool with explicit @image_name references (e.g., "Edit @my_image")
- When users ask to create new images, use the generate_image tool without any @image_name references
- When users ask to analyze, describe, or examine images, use the analyze_image tool with explicit @image_name references
- BOTH tools only include images when explicitly referenced with @image_name - they never auto-include visible images
- The analyze_image tool REQUIRES explicit @image_name references and will fail without them
- NEVER say you cannot edit or analyze images - you have both generate_image and analyze_image tools available
- Always use explicit @image_name references when working with specific images from STM`;

  const finalSystem = systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim().length > 0
    ? `${baseInstructions}\n\n${systemPrompt}`
    : baseInstructions;

  // Add OpenAI's built-in web search tool
  const webSearchTool = {
    web_search: openai.tools.webSearch({
      searchContextSize: 'high',
      //userLocation: { type: 'approximate', city: 'Paris', region: 'Île-de-France' },
    }),
  };

  // Combine client tools with web search
  const allTools = { ...serverTools, ...webSearchTool } as any;
  
  console.log('🎯 Final tool setup:', {
    serverToolCount: Object.keys(serverTools).length,
    serverToolNames: Object.keys(serverTools),
    totalToolCount: Object.keys(allTools).length,
    hasWebSearch: 'web_search' in allTools
  });

  console.log('🔍 SERVER: Final system prompt preview:', finalSystem.substring(0, 200) + '...');
  
  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: finalSystem,
    tools: allTools,
    stopWhen: [stepCountIs(5)],
    // v5 API: Enhanced logging
    onFinish: (result) => {
      console.log('🏁 Stream finished:', {
        finishReason: result.finishReason,
        usage: result.usage,
        toolCalls: result.toolCalls?.length || 0,
        toolCallNames: result.toolCalls?.map(tc => tc.toolName) || [],
        responsePreview: result.text?.substring(0, 100) + '...'
      });
      
      // Log each tool call in detail
      result.toolCalls?.forEach((toolCall, index) => {
        console.log(`🔧 Tool call ${index + 1}:`, {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          input: (toolCall as any).input || (toolCall as any).args
        });
      });
    },
    onStepFinish: (step) => {
      console.log('👣 Step finished:', {
        text: step.text?.substring(0, 100) + '...',
        toolCalls: step.toolCalls?.length || 0,
        toolResults: step.toolResults?.length || 0,
        usage: step.usage,
        finishReason: step.finishReason
      });
      
      // Log tool calls in this step
      step.toolCalls?.forEach((toolCall, index) => {
        console.log(`  🔧 Step tool call ${index + 1}:`, {
          toolName: toolCall.toolName,
          input: (toolCall as any).input || (toolCall as any).args
        });
      });
      
      // Log tool results in this step
      step.toolResults?.forEach((result, index) => {
        console.log(`  ✅ Step tool result ${index + 1}:`, {
          toolCallId: result.toolCallId,
          output: (result as any).output || (result as any).result
        });
      });
    }
  });

  return result.toUIMessageStreamResponse();
};
