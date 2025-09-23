import { NextRequest } from 'next/server';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export const POST = async (req: NextRequest) => {
  const { messages, toolSchemas } = await req.json();

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

  const result = await streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: `You are a helpful assistant that can remember information about users using a client-side Short Term Memory (STM) system.

The user has an STM system running in their browser that can store key-value pairs. You can write to existing STM keys using the available tools.

Current STM tools available: ${Object.keys(serverTools).join(', ')}

When users share information they want you to remember, use the appropriate write tools to store that information in their STM. The STM persists in their browser session.

Be conversational and helpful. When you store something in STM, acknowledge what you've stored.`,
    tools: serverTools,
    stopWhen: [stepCountIs(5)],
    // v5 API: Use onFinish instead of onStepFinish for logging
    onFinish: ({ finishReason, usage, toolResults }) => {
      console.log('🔄 SERVER: Chat finished:', { finishReason, usage, toolResults });
    },
  });

  return result.toUIMessageStreamResponse();
};
