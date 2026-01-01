'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

interface OAuthApp {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  redirect_uris: string[];
  scopes: string[];
  logo_url: string | null;
  homepage_url: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface NewlyCreatedApp extends OAuthApp {
  client_secret: string; // Only returned once at creation
}

// Info tooltip component
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        className="text-gray-500 hover:text-gray-300 transition"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => {
          e.preventDefault(); setShow(!show);
        }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {show && (
        <div className="absolute z-[100] top-full left-0 mt-2 w-64
                        p-2 bg-gray-800 border border-gray-600 rounded-lg shadow-lg text-xs text-gray-300">
          {text}
          <div className="absolute bottom-full left-4 mb-0">
            <div className="border-4 border-transparent border-b-gray-800" />
          </div>
        </div>
      )}
    </span>
  );
}

export default function OAuthAppsPage() {
  const { getToken } = useAuth();
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newlyCreatedApp, setNewlyCreatedApp] = useState<NewlyCreatedApp | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<OAuthApp | null>(null);

  const fetchApps = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/api/oauth/apps`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch OAuth apps');
      }

      const data = await response.json();
      setApps(data.apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OAuth apps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleDelete = async (appId: string) => {
    if (!confirm('Delete this OAuth app? All users will lose access.')) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        return;
      }

      await fetch(`${API_URL}/api/oauth/apps/${appId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      setApps(apps.filter(a => a.id !== appId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleRegenerateSecret = async (appId: string) => {
    if (!confirm('Regenerate client secret? The old secret will stop working immediately.')) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/api/oauth/apps/${appId}/regenerate-secret`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate secret');
      }

      const data = await response.json();
      const app = apps.find(a => a.id === appId);
      if (app) {
        setNewlyCreatedApp({ ...app, client_secret: data.client_secret });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate secret');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-bold">OAuth Apps</h1>
          <p className="text-gray-500 text-sm mt-1">
            Register apps that can use &quot;Sign in with MindCache&quot; for their users.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-white text-black text-sm rounded hover:bg-gray-200"
        >
          + New App
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Newly created app secret banner */}
      {newlyCreatedApp && (
        <div className="mb-6 p-4 bg-red-900/20 border-2 border-red-800 rounded-lg">
          <div className="flex items-start justify-between mb-3">
            <p className="text-red-400 font-bold text-lg">⚠️ COPY CLIENT SECRET NOW</p>
            <button
              onClick={() => setNewlyCreatedApp(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-red-300 mb-4 font-medium">
            <strong>This client secret will NEVER be displayed again.</strong> Copy it now and store it securely.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400">App Name:</label>
              <p className="text-white font-medium">{newlyCreatedApp.name}</p>
            </div>
            <div>
              <label className="text-xs text-gray-400">Client ID:</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-black rounded text-green-400 font-mono text-sm break-all">
                  {newlyCreatedApp.client_id}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedApp.client_id, 'client_id')}
                  className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                >
                  {copiedField === 'client_id' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Client Secret:</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-black rounded text-green-400 font-mono text-sm break-all">
                  {newlyCreatedApp.client_secret}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedApp.client_secret, 'client_secret')}
                  className="px-3 py-2 bg-green-800 rounded text-sm hover:bg-green-700 whitespace-nowrap"
                >
                  {copiedField === 'client_secret' ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-8">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          <p className="mb-4">No OAuth apps yet.</p>
          <p className="text-sm">
            Create an OAuth app to enable &quot;Sign in with MindCache&quot; for your users.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map(app => (
            <div key={app.id} className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 hover:bg-gray-900/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-lg">{app.name}</span>
                      {app.is_active ? (
                        <span className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400">Active</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">Inactive</span>
                      )}
                    </div>
                    {app.description && (
                      <p className="text-sm text-gray-400 mb-2">{app.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div>
                        <span className="text-gray-600">Client ID: </span>
                        <code className="text-gray-400 font-mono">{app.client_id}</code>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      <span className="text-gray-600">Scopes: </span>
                      {app.scopes.map(scope => (
                        <span key={scope} className="inline-block px-2 py-0.5 mr-1 rounded bg-gray-800 text-gray-400">
                          {scope}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      <span className="text-gray-600">Redirect URIs: </span>
                      {app.redirect_uris.map((uri, i) => (
                        <span key={i} className="font-mono">{uri}{i < app.redirect_uris.length - 1 ? ', ' : ''}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingApp(app)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition"
                      title="Edit app"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRegenerateSecret(app.id)}
                      className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-800 rounded-md transition"
                      title="Regenerate secret"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(app.id)}
                      className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                      title="Delete app"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateAppModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(app) => {
            setApps([app, ...apps]);
            setNewlyCreatedApp(app);
            setShowCreateModal(false);
          }}
          getToken={getToken}
        />
      )}

      {editingApp && (
        <EditAppModal
          app={editingApp}
          onClose={() => setEditingApp(null)}
          onUpdated={(updatedApp) => {
            setApps(apps.map(a => a.id === updatedApp.id ? updatedApp : a));
            setEditingApp(null);
          }}
          getToken={getToken}
        />
      )}
    </div>
  );
}

function CreateAppModal({
  onClose,
  onCreated,
  getToken
}: {
  onClose: () => void;
  onCreated: (app: NewlyCreatedApp) => void;
  getToken: () => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [redirectUris, setRedirectUris] = useState('http://localhost:3000/callback');
  const [scopes, setScopes] = useState(['read', 'write']);
  const [homepageUrl, setHomepageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    const uris = redirectUris.split('\n').map(u => u.trim()).filter(Boolean);
    if (uris.length === 0) {
      setError('At least one redirect URI is required');
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/api/oauth/apps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          redirect_uris: uris,
          scopes,
          homepage_url: homepageUrl.trim() || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create app');
      }

      const app = await response.json();
      onCreated(app);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter(s => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Create OAuth App</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              App Name *
              <InfoTooltip text="The name shown to users when they authorize your app. Choose something recognizable." />
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="My App"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Description
              <InfoTooltip text="A brief description of your app. Shown to users on the consent screen." />
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="A brief description of your app"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Homepage URL
              <InfoTooltip text="Your app's homepage. Users can click this to learn more about your app." />
            </label>
            <input
              type="url"
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
              placeholder="https://myapp.com"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Redirect URIs *
              <InfoTooltip text="URLs where users will be redirected after authorization. One per line. For development, use http://localhost:3000. For production, add your deployed URL." />
            </label>
            <textarea
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none font-mono text-sm"
              rows={3}
              placeholder="http://localhost:3000/callback&#10;https://myapp.com/callback"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-2">
              Allowed Scopes
              <InfoTooltip text="Permissions your app can request. 'read' allows reading data, 'write' allows modifying data, 'profile' gives access to user email and name." />
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('read')}
                  onChange={() => toggleScope('read')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">read</span>
                <span className="text-xs text-gray-500">- Read user&apos;s data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('write')}
                  onChange={() => toggleScope('write')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">write</span>
                <span className="text-xs text-gray-500">- Modify user&apos;s data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('profile')}
                  onChange={() => toggleScope('profile')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">profile</span>
                <span className="text-xs text-gray-500">- Access user&apos;s profile info</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Creating...' : 'Create App'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAppModal({
  app,
  onClose,
  onUpdated,
  getToken
}: {
  app: OAuthApp;
  onClose: () => void;
  onUpdated: (app: OAuthApp) => void;
  getToken: () => Promise<string | null>;
}) {
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description || '');
  const [redirectUris, setRedirectUris] = useState(app.redirect_uris.join('\n'));
  const [scopes, setScopes] = useState(app.scopes);
  const [homepageUrl, setHomepageUrl] = useState(app.homepage_url || '');
  const [isActive, setIsActive] = useState(app.is_active === 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    const uris = redirectUris.split('\n').map(u => u.trim()).filter(Boolean);
    if (uris.length === 0) {
      setError('At least one redirect URI is required');
      return;
    }

    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/api/oauth/apps/${app.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          redirect_uris: uris,
          scopes,
          homepage_url: homepageUrl.trim() || null,
          is_active: isActive
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update app');
      }

      const updatedApp = await response.json();
      onUpdated(updatedApp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update app');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter(s => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Edit OAuth App</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              App Name *
              <InfoTooltip text="The name shown to users when they authorize your app. Choose something recognizable." />
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Description
              <InfoTooltip text="A brief description of your app. Shown to users on the consent screen." />
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Homepage URL
              <InfoTooltip text="Your app's homepage. Users can click this to learn more about your app." />
            </label>
            <input
              type="url"
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-1">
              Redirect URIs *
              <InfoTooltip text="URLs where users will be redirected after authorization. One per line. For development, use http://localhost:3000. For production, add your deployed URL." />
            </label>
            <textarea
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:border-gray-500 outline-none font-mono text-sm"
              rows={3}
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center text-sm text-gray-400 mb-2">
              Allowed Scopes
              <InfoTooltip text="Permissions your app can request. 'read' allows reading data, 'write' allows modifying data, 'profile' gives access to user email and name." />
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('read')}
                  onChange={() => toggleScope('read')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">read</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('write')}
                  onChange={() => toggleScope('write')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">write</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes('profile')}
                  onChange={() => toggleScope('profile')}
                  className="rounded bg-gray-800 border-gray-600"
                />
                <span className="text-sm">profile</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600"
              />
              <span className="text-sm">App is active</span>
              <span className="text-xs text-gray-500">- Inactive apps cannot authorize new users</span>
            </label>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
