import { NextRequest } from 'next/server';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export const POST = async (req: NextRequest) => {
  const { messages, toolSchemas, systemPrompt } = await req.json();

  // Convert client tool schemas to server tool definitions (schema only, no execute)
  const serverTools: Record<string, any> = {};
  
  if (toolSchemas && typeof toolSchemas === 'object') {
    Object.entries(toolSchemas).forEach(([toolName, schema]: [string, any]) => {
      // Recreate the Zod schema on the server side
      const zodSchema = z.object({
        value: z.string().describe(`The value to write to ${toolName.replace('write_', '')}`)
      });
      
      serverTools[toolName] = tool({
        description: schema.description,
        inputSchema: zodSchema,
        // NO execute function - this forces client-side execution via onToolCall
      });
    });
  }

  // Build the final system prompt, optionally combining client-provided content
  const baseInstructions = `Here are some facts and instructions for you to follow.`;

  const finalSystem = systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim().length > 0
    ? `${baseInstructions}\n\n${systemPrompt}`
    : baseInstructions;

  console.log('🔍 SERVER: Final system prompt:', finalSystem);
  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: finalSystem,
    tools: serverTools,
    stopWhen: [stepCountIs(5)],
    // v5 API: Use onFinish instead of onStepFinish for logging
    onFinish: ({ finishReason, usage, toolResults }) => {
      console.log('🔄 SERVER: Chat finished:', { finishReason, usage, toolResults });
    },
  });

  return result.toUIMessageStreamResponse();
};
