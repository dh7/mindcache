import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface DONamespace {
  id: string;
  name: string;
  class: string;
  script: string;
}

interface DOObject {
  id: string;
  hasStoredData: boolean;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors: { message: string }[];
}

export async function GET() {
  const { userId } = await auth();

  // Admin check - add your admin user IDs here
  const ADMIN_USERS = process.env.ADMIN_USER_IDS?.split(',') || [];
  if (!userId || (ADMIN_USERS.length > 0 && !ADMIN_USERS.includes(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: 'Cloudflare credentials not configured' },
      { status: 500 }
    );
  }

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. List all DO namespaces
    const nsRes = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/workers/durable_objects/namespaces`,
      { headers }
    );
    const nsData = await nsRes.json() as CloudflareResponse<DONamespace[]>;

    if (!nsData.success) {
      return NextResponse.json(
        { error: nsData.errors?.[0]?.message || 'Failed to fetch namespaces' },
        { status: 500 }
      );
    }

    // 2. For each namespace, list objects
    const namespaces = await Promise.all(
      nsData.result.map(async (ns) => {
        const objRes = await fetch(
          `${CF_API_BASE}/accounts/${accountId}/workers/durable_objects/namespaces/${ns.id}/objects`,
          { headers }
        );
        const objData = await objRes.json() as CloudflareResponse<DOObject[]>;

        return {
          id: ns.id,
          name: ns.name,
          class: ns.class,
          script: ns.script,
          objects: objData.success ? objData.result : [],
          objectCount: objData.success ? objData.result.length : 0
        };
      })
    );

    return NextResponse.json({ namespaces });
  } catch (error) {
    console.error('Cloudflare API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Durable Objects' },
      { status: 500 }
    );
  }
}

