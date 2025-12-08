import { NextRequest } from 'next/server';

export const maxDuration = 60;

/**
 * Proxy image analysis requests to MindCache Cloud API
 * 
 * Analyze images with GPT-4 Vision, saving results to MindCache keys
 */
export const POST = async (req: NextRequest) => {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey) {
      return Response.json({ error: 'MINDCACHE_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { instanceId, imageKey, imageUrl, imageBase64, prompt, promptKey, outputKey, model } = body;

    if (!instanceId || !outputKey) {
      return Response.json({ error: 'instanceId and outputKey required' }, { status: 400 });
    }

    if (!imageKey && !imageUrl && !imageBase64) {
      return Response.json({ error: 'One of imageKey, imageUrl, or imageBase64 required' }, { status: 400 });
    }

    if (!prompt && !promptKey) {
      return Response.json({ error: 'Either prompt or promptKey required' }, { status: 400 });
    }

    const response = await fetch(`${apiUrl}/api/analyze-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        instanceId,
        imageKey,
        imageUrl,
        imageBase64,
        prompt,
        promptKey,
        outputKey,
        model,
      }),
    });

    const result = await response.json();
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error('Analyze image proxy error:', error);
    return Response.json({ error: 'Failed to analyze image' }, { status: 500 });
  }
};

