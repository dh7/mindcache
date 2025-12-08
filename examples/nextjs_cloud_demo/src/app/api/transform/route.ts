import { NextRequest } from 'next/server';

export const maxDuration = 60;

/**
 * Proxy transform requests to MindCache Cloud API
 * 
 * Transform template text with LLM, reading/writing to MindCache keys
 */
export const POST = async (req: NextRequest) => {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey) {
      return Response.json({ error: 'MINDCACHE_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { instanceId, template, templateKey, outputKey, prompt, promptKey, model } = body;

    if (!instanceId || !outputKey) {
      return Response.json({ error: 'instanceId and outputKey required' }, { status: 400 });
    }

    if (!template && !templateKey) {
      return Response.json({ error: 'Either template or templateKey required' }, { status: 400 });
    }

    const response = await fetch(`${apiUrl}/api/transform`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        instanceId,
        template,
        templateKey,
        outputKey,
        prompt,
        promptKey,
        model,
      }),
    });

    const result = await response.json();
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error('Transform proxy error:', error);
    return Response.json({ error: 'Failed to transform' }, { status: 500 });
  }
};

