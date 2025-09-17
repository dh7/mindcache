import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return Response.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    // Generate response using AI SDK
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: prompt,
    })

    return Response.json({
      content: result.text,
      usage: result.usage
    })

  } catch (error: unknown) {
    // eslint-disable-next-line no-console
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
