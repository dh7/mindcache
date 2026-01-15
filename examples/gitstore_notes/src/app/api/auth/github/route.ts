import { NextResponse } from 'next/server';
import { GitStoreAuth } from '@mindcache/gitstore';
import { cookies } from 'next/headers';

const auth = new GitStoreAuth({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/github/callback`
});

export async function GET() {
  const { url, state } = auth.getAuthUrl({ 
    scopes: ['repo', 'read:user'] 
  });

  // Store state in cookie for CSRF verification
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10 // 10 minutes
  });

  return NextResponse.redirect(url);
}
