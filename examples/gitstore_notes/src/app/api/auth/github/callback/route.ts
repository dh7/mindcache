import { NextRequest, NextResponse } from 'next/server';
import { GitStoreAuth } from '@mindcache/gitstore';
import { cookies } from 'next/headers';

const auth = new GitStoreAuth({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/github/callback`
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    const errorDescription = searchParams.get('error_description') || error;
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}?error=${encodeURIComponent(errorDescription)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}?error=Missing code or state`
    );
  }

  // Verify state (CSRF protection)
  const cookieStore = await cookies();
  const storedState = cookieStore.get('oauth_state')?.value;
  
  if (state !== storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}?error=Invalid state parameter`
    );
  }

  try {
    // Exchange code for access token
    const tokens = await auth.handleCallback(code);
    
    // Get user info
    const user = await auth.getUser(tokens.accessToken);

    // Store token and user info in cookies (in production, use a database!)
    cookieStore.set('github_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    cookieStore.set('github_user', JSON.stringify({
      id: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl
    }), {
      httpOnly: false, // Allow client-side access for display
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    // Clear state cookie
    cookieStore.delete('oauth_state');

    // Redirect to app
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}`);

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}?error=Authentication failed`
    );
  }
}
