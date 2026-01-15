import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  
  cookieStore.delete('github_token');
  cookieStore.delete('github_user');

  return NextResponse.json({ success: true });
}
