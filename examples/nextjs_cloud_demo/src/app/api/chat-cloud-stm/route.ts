import { NextRequest } from 'next/server';

export const maxDuration = 60;

/**
 * Proxy chat requests to MindCache Cloud API
 */
export const POST = async (req: NextRequest) => {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey) {
      return Response.json({ error: 'MINDCACHE_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { messages, mode = 'use', instanceId } = body;

    if (!instanceId) {
      return Response.json({ error: 'instanceId required' }, { status: 400 });
    }

    console.log('☁️ Proxying chat to MindCache Cloud:', {
      instanceId,
      messageCount: messages?.length,
      mode
    });

    // Forward to MindCache Cloud Chat API
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages,
        instanceId,
        mode,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('☁️ MindCache Cloud error:', error);
      return Response.json(
        { error: `MindCache Cloud error: ${error}` },
        { status: response.status }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('☁️ Chat proxy error:', error);
    return Response.json(
      { error: 'Failed to connect to MindCache Cloud' },
      { status: 500 }
    );
  }
};
