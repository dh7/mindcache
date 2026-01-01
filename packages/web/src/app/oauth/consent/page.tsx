'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth, SignIn, SignedIn, SignedOut } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

interface OAuthApp {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    homepage_url: string | null;
}

const SCOPE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  read: { label: 'Read data', description: 'Read your MindCache data in this app' },
  write: { label: 'Write data', description: 'Create and modify your MindCache data in this app' },
  admin: { label: 'Full access', description: 'Full admin access to your MindCache data' },
  profile: { label: 'Profile info', description: 'Access your basic profile information (email, name)' },
  github_sync: { label: 'GitHub sync', description: 'Sync your data with your GitHub repositories' }
};

function ConsentPageContent() {
  const { getToken, isLoaded } = useAuth();
  const searchParams = useSearchParams();

  const [app, setApp] = useState<OAuthApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Parse OAuth parameters from URL
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scopeParam = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  const scopes = scopeParam?.split(' ').filter(Boolean) || ['read'];

  // Fetch app info
  useEffect(() => {
    if (!clientId) {
      setError('Missing client_id parameter');
      setLoading(false);
      return;
    }

    const fetchApp = async () => {
      try {
        // Fetch app info (public endpoint)
        const response = await fetch(`${API_URL}/api/oauth/apps/info?client_id=${clientId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Unknown application');
          } else {
            setError('Failed to load application info');
          }
          return;
        }

        const data = await response.json();
        setApp(data);
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchApp();
  }, [clientId]);

  const handleAuthorize = async (approved: boolean) => {
    if (!clientId || !redirectUri) {
      setError('Missing required parameters');
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/oauth/authorize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: scopes.join(' '),
          state: state || undefined,
          code_challenge: codeChallenge || undefined,
          code_challenge_method: codeChallengeMethod || undefined,
          approved
        })
      });

      if (!response.ok) {
        const data = await response.json();

        // If redirect, handle it
        if (response.status === 302 || data.redirect) {
          window.location.href = data.redirect || response.headers.get('Location') || redirectUri;
          return;
        }

        throw new Error(data.error_description || data.error || 'Authorization failed');
      }

      // Check for redirect in response
      const location = response.headers.get('Location');
      if (location) {
        window.location.href = location;
        return;
      }

      // If we get JSON back, it might contain a redirect
      const data = await response.json().catch(() => null);
      if (data?.redirect) {
        window.location.href = data.redirect;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    // Redirect back with error
    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'User denied authorization');
      if (state) {
        url.searchParams.set('state', state);
      }
      window.location.href = url.toString();
    }
  };

  // Show sign in if not authenticated
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <SignedOut>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Sign in to continue</h1>
            <p className="text-gray-400 text-sm">
              {app ? `${app.name} wants to access your MindCache` : 'Sign in to continue'}
            </p>
          </div>
          <SignIn
            routing="hash"
            afterSignInUrl={typeof window !== 'undefined' ? window.location.href : undefined}
          />
        </div>
      </SignedOut>

      <SignedIn>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 w-full max-w-md">
          {loading ? (
            <div className="text-center text-gray-400">Loading...</div>
          ) : error ? (
            <div className="text-center">
              <div className="text-red-400 mb-4">⚠️ {error}</div>
              <button
                onClick={() => window.history.back()}
                className="text-gray-400 hover:text-white text-sm"
              >
                                Go back
              </button>
            </div>
          ) : app ? (
            <>
              {/* App info */}
              <div className="text-center mb-6">
                {app.logo_url ? (
                  <img
                    src={app.logo_url}
                    alt={app.name}
                    className="w-16 h-16 rounded-lg mx-auto mb-4 bg-gray-800"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg mx-auto mb-4 bg-gray-800 flex items-center justify-center">
                    <span className="text-2xl">📱</span>
                  </div>
                )}
                <h2 className="text-xl font-bold text-white mb-1">{app.name}</h2>
                {app.description && (
                  <p className="text-gray-400 text-sm">{app.description}</p>
                )}
                {app.homepage_url && (
                  <a
                    href={app.homepage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-xs hover:underline"
                  >
                    {new URL(app.homepage_url).hostname}
                  </a>
                )}
              </div>

              {/* Consent message */}
              <div className="mb-6">
                <p className="text-gray-300 text-center mb-4">
                                    This app wants to access your MindCache data
                </p>

                {/* Scopes */}
                <div className="space-y-2">
                  {scopes.map(scope => {
                    const info = SCOPE_DESCRIPTIONS[scope] || { label: scope, description: '' };
                    return (
                      <div key={scope} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                        <div className="text-green-400 mt-0.5">✓</div>
                        <div>
                          <div className="text-white text-sm font-medium">{info.label}</div>
                          <div className="text-gray-400 text-xs">{info.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Instance info */}
              <div className="mb-6 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                <p className="text-blue-300 text-sm">
                  <strong>Note:</strong> This app will have its own isolated data space.
                                    It cannot access your other MindCache projects.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleDeny}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                >
                                    Deny
                </button>
                <button
                  onClick={() => handleAuthorize(true)}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition disabled:opacity-50 font-medium"
                >
                  {submitting ? 'Authorizing...' : 'Authorize'}
                </button>
              </div>

              {/* Privacy notice */}
              <p className="text-gray-500 text-xs text-center mt-4">
                                By authorizing, you allow this app to use MindCache on your behalf.
              </p>
            </>
          ) : null}
        </div>
      </SignedIn>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <ConsentPageContent />
    </Suspense>
  );
}
