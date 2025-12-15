import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 60;

/**
 * Proxy chat requests to MindCache Server API
 */
export const POST = async (req: NextRequest) => {
  try {
    const { getToken } = await auth();
    const token = await getToken();

    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
    const body = await req.json();
    const { messages, mode = 'use', instanceId } = body;

    if (!instanceId) {
      return Response.json({ error: 'instanceId required' }, { status: 400 });
    }

    console.log('💬 Proxying chat to MindCache Server:', {
      instanceId,
      messageCount: messages?.length,
      mode
    });

    // Forward to MindCache Server Chat API
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messages,
        instanceId,
        mode
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('💬 MindCache Server error:', error);
      return Response.json(
        { error: `MindCache Server error: ${error}` },
        { status: response.status }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('💬 Chat proxy error:', error);
    return Response.json(
      { error: 'Failed to connect to MindCache Server' },
      { status: 500 }
    );
  }
};

