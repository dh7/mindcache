import { NextRequest } from 'next/server';
import { streamText, tool, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export const POST = async (req: NextRequest) => {
  const { messages, toolSchemas, systemPrompt }: {
    messages: UIMessage[];
    toolSchemas?: Record<string, { description: string }>;
    systemPrompt?: string;
  } = await req.json();

  // Convert client tool schemas to server tool definitions (schema only, no execute)
  const serverTools: Record<string, unknown> = {};
  
  if (toolSchemas && typeof toolSchemas === 'object') {
    Object.entries(toolSchemas).forEach(([toolName, schema]: [string, { description: string }]) => {
      if (toolName === 'generate_image') {
        // Special schema for generate_image tool
        serverTools[toolName] = tool({
          description: schema.description,
          inputSchema: z.object({
            prompt: z.string().describe('The prompt for image generation or editing. Can include image references like @images_1 or {image_1}'),
            mode: z.enum(['generate', 'edit']).optional().describe('Mode: "generate" for new images, "edit" to modify existing images')
          }),
          // NO execute function - this forces client-side execution via onToolCall
        });
      } else {
        // Default schema for write_ tools
        serverTools[toolName] = tool({
          description: schema.description,
          inputSchema: z.object({
            value: z.string().describe(`The value to write to ${toolName.replace('write_', '')}`)
          }),
          // NO execute function - this forces client-side execution via onToolCall
        });
      }
    });
  }

  // Build the final system prompt, optionally combining client-provided content
  const baseInstructions = `Here are some facts and instructions for you to follow.`;

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

  //console.log('🔍 SERVER: Final system prompt:', finalSystem);
  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: finalSystem,
    tools: allTools,
    stopWhen: [stepCountIs(5)],
    // v5 API: Use onFinish instead of onStepFinish for logging
    onFinish: () => {
      // Logging disabled for cleaner output
    },
  });

  return result.toUIMessageStreamResponse();
};
