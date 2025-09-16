import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env.local file.' },
        { status: 500 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { prompt } = body

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    // Get configuration from environment variables with defaults
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
    const maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '500')
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')

    // Make request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('OpenAI API Error:', errorData)
      
      // Return user-friendly error messages
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key. Please check your .env.local configuration.' },
          { status: 401 }
        )
      } else if (response.status === 429) {
        return NextResponse.json(
          { error: 'OpenAI API rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      } else if (response.status === 400) {
        return NextResponse.json(
          { error: errorData.error?.message || 'Bad request to OpenAI API' },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: 'OpenAI API request failed. Please try again.' },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    
    // Extract the generated content
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { error: 'No content generated from OpenAI API' },
        { status: 500 }
      )
    }

    // Return the generated content
    return NextResponse.json({
      content,
      model,
      usage: data.usage
    })

  } catch (error) {
    console.error('API Route Error:', error)
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    )
  }
}
