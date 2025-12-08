import { NextRequest, NextResponse } from 'next/server';

const DEMO_INSTANCES = ['form', 'image', 'workflow', 'mindcache-editor'];

/**
 * GET /api/instances - List or create demo instances
 * Returns instance IDs for each demo type
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.MINDCACHE_API_KEY;
    const projectId = process.env.MINDCACHE_PROJECT_ID;
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://mindcache-api.dh7777777.workers.dev';

    if (!apiKey || !projectId) {
      return NextResponse.json(
        { error: 'MINDCACHE_API_KEY and MINDCACHE_PROJECT_ID required' },
        { status: 500 }
      );
    }

    // Get existing instances
    const listResponse = await fetch(`${apiUrl}/api/projects/${projectId}/instances`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!listResponse.ok) {
      const error = await listResponse.text();
      console.error('Failed to list instances:', listResponse.status, error);
      console.error('URL:', `${apiUrl}/api/projects/${projectId}/instances`);
      return NextResponse.json({ error: `Failed to list instances: ${listResponse.status} - ${error}` }, { status: 500 });
    }

    const { instances } = await listResponse.json();
    const instanceMap: Record<string, string> = {};

    // Map existing instances by name
    for (const inst of instances) {
      if (DEMO_INSTANCES.includes(inst.name)) {
        instanceMap[inst.name] = inst.id;
      }
    }

    // Create missing instances
    for (const demoName of DEMO_INSTANCES) {
      if (!instanceMap[demoName]) {
        console.log(`Creating instance: ${demoName}`);
        
        const createResponse = await fetch(`${apiUrl}/api/projects/${projectId}/instances`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: demoName }),
        });

        if (createResponse.ok) {
          const newInstance = await createResponse.json();
          instanceMap[demoName] = newInstance.id;
          console.log(`Created instance ${demoName}: ${newInstance.id}`);
        } else {
          console.error(`Failed to create instance ${demoName}`);
        }
      }
    }

    return NextResponse.json({ 
      projectId,
      instances: instanceMap 
    });
  } catch (error) {
    console.error('Instance management error:', error);
    return NextResponse.json(
      { error: 'Failed to manage instances' },
      { status: 500 }
    );
  }
}

