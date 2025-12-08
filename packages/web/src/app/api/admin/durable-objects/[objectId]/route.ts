import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ objectId: string }> }
) {
  const { userId } = await auth();

  const ADMIN_USERS = process.env.ADMIN_USER_IDS?.split(',') || [];
  if (!userId || (ADMIN_USERS.length > 0 && !ADMIN_USERS.includes(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workerUrl = process.env.MINDCACHE_WORKER_URL;
  const adminToken = process.env.MINDCACHE_ADMIN_TOKEN;

  if (!workerUrl || !adminToken) {
    return NextResponse.json(
      { error: 'Worker credentials not configured' },
      { status: 500 }
    );
  }

  const { objectId } = await params;

  try {
    const res = await fetch(`${workerUrl}/admin/do/${objectId}`, {
      headers: { 'X-Admin-Token': adminToken }
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch DO contents', details: String(error) },
      { status: 500 }
    );
  }
}

