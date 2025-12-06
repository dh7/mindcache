import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/ws-token?instanceId=xxx
 * 
 * Generates a short-lived token for WebSocket connection.
 * Uses server-side API key - never exposed to browser.
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'MINDCACHE_API_KEY not configured' },
        { status: 500 }
      );
    }

    const instanceId = request.nextUrl.searchParams.get('instanceId');
    if (!instanceId) {
      return NextResponse.json(
        { error: 'instanceId required' },
        { status: 400 }
      );
    }

    console.log('☁️ Getting WS token for instance:', instanceId);

    // Get token from MindCache API (using server-side API key)
    const response = await fetch(`${apiUrl}/api/ws-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        instanceId,
        permission: 'write',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('☁️ Failed to get WS token:', error);
      return NextResponse.json(
        { error: `Failed to get token: ${error}` },
        { status: response.status }
      );
    }

    const tokenData = await response.json();
    console.log('☁️ Got WS token, expires at:', new Date(tokenData.expiresAt * 1000));

    return NextResponse.json(tokenData);
  } catch (error) {
    console.error('☁️ WS token error:', error);
    return NextResponse.json(
      { error: 'Failed to get WebSocket token' },
      { status: 500 }
    );
  }
}

