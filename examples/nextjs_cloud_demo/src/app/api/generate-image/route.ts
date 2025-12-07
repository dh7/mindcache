import { NextRequest } from 'next/server';

export const maxDuration = 120; // Image gen can take a while

/**
 * Proxy image generation requests to MindCache Cloud API
 * 
 * Generate images with Fireworks flux-kontext-pro, saving to MindCache keys
 */
export const POST = async (req: NextRequest) => {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey) {
      return Response.json({ error: 'MINDCACHE_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { instanceId, prompt, promptKey, outputKey, imageKey, imageKeys, seed, aspectRatio, safetyTolerance } = body;

    if (!instanceId || !outputKey) {
      return Response.json({ error: 'instanceId and outputKey required' }, { status: 400 });
    }

    if (!prompt && !promptKey) {
      return Response.json({ error: 'Either prompt or promptKey required' }, { status: 400 });
    }

    const response = await fetch(`${apiUrl}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        instanceId,
        prompt,
        promptKey,
        outputKey,
        imageKey,
        imageKeys,
        seed,
        aspectRatio,
        safetyTolerance,
      }),
    });

    const result = await response.json();
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error('Generate image proxy error:', error);
    return Response.json({ error: 'Failed to generate image' }, { status: 500 });
  }
};

