/* eslint-disable no-console */
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod/v3'
import { mindcache } from 'mindcache'

export async function POST(request: Request) {
  try {
    const { prompt, stmData } = await request.json()
    console.log('🤖 AI Tools API called with prompt:', prompt)
    console.log('📊 Current STM data from client:', stmData)

    if (!prompt) {
      return Response.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    // Initialize STM with the keys from client data (to match the client state)
    if (stmData) {
      Object.keys(stmData).forEach(key => {
        if (!key.startsWith('$')) { // Skip system keys like $date, $time
          mindcache.set(key, stmData[key])
        }
      })
    }

    console.log('🧪 Server STM initialized:', mindcache.getSTM())

    // Store tool results for later extraction
    const toolResults: Record<string, any> = {}
    
    // Get dynamically generated tools from MindCache
    const dynamicTools = mindcache.get_aisdk_tools()
    console.log('🔧 Generated dynamic tools:', Object.keys(dynamicTools))

    // Wrap MindCache tools to add result storage and client instruction format
    const tools: Record<string, any> = {}
    Object.entries(dynamicTools).forEach(([toolName, tool]: [string, any]) => {
      tools[toolName] = {
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async ({ value }: { value: string }) => {
          console.log(`🔧 ${toolName} tool called with value:`, value)
          
          // Execute the original MindCache tool
          const originalResult = await tool.execute({ value })
          
          // Convert result to client instruction format
          const result = {
            action: 'set_stm',
            key: originalResult.key,
            value: originalResult.value,
            result: originalResult.result
          }
          
          toolResults[toolName] = result
          console.log(`✅ ${toolName} tool result stored:`, result)
          return result
        }
      }
    })

    // Generate response using AI SDK with tools
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: 'You are a helpful assistant that can update a user\'s Short-Term Memory (STM) using the available tools. Extract relevant personal information and store it using the appropriate tools.',
      prompt: `Current STM state: ${JSON.stringify(stmData)}

User message: ${prompt}

Please extract any personal information from the user's message and update the STM accordingly. Use the available tools to write the extracted information. After updating the STM, provide a friendly response acknowledging what you've learned about the user.`,
      tools: tools,
    })

    console.log('🧠 AI response received:', result.text)
    console.log('🔨 Tool calls made:', result.toolCalls?.length || 0)

    // Extract tool calls for client execution using stored results
    const toolCalls = result.toolCalls?.map(call => {
      console.log('🔍 Processing tool call:', call)
      const callAny = call as any
      const storedResult = toolResults[call.toolName] || {}
      return {
        toolName: call.toolName,
        args: callAny.input || callAny.args || {},
        result: storedResult
      }
    }) || []

    console.log('📊 Processed tool calls:', toolCalls)

    const responseData = {
      response: result.text,
      toolCalls: toolCalls
    }

    console.log('📤 Sending response:', responseData)

    return Response.json(responseData)

  } catch (error: unknown) {
    console.error('API Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Handle specific OpenAI API errors
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'insufficient_quota') {
        return Response.json(
          { error: 'OpenAI API quota exceeded. Please check your API key and billing.' },
          { status: 429 }
        )
      }
      
      if (error.code === 'invalid_api_key') {
        return Response.json(
          { error: 'Invalid OpenAI API key. Please check your environment variables.' },
          { status: 401 }
        )
      }
    }

    return Response.json(
      { error: errorMessage || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}