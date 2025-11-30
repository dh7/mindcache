'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { listShares, createShare, deleteShare, type Share } from '@/lib/api';

interface ShareModalProps {
  resourceType: 'projects' | 'instances';
  resourceId: string;
  resourceName: string;
  onClose: () => void;
}

export function ShareModal({ resourceType, resourceId, resourceName, onClose }: ShareModalProps) {
  const { getToken } = useAuth();
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New share form
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchShares = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const data = await listShares(token, resourceType, resourceId);
      setShares(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, [resourceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPublic && !email.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const token = await getToken();
      if (!token) return;

      const newShare = await createShare(token, resourceType, resourceId, {
        targetType: isPublic ? 'public' : 'user',
        targetEmail: isPublic ? undefined : email.trim(),
        permission,
      });

      setShares([...shares, newShare]);
      setEmail('');
      setIsPublic(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (shareId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      await deleteShare(token, shareId);
      setShares(shares.filter(s => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Share "{resourceName}"</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Add share form */}
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-400">Make public (anyone with link)</label>
          </div>

          {!isPublic && (
            <div className="mb-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-gray-500 outline-none"
                disabled={submitting}
              />
            </div>
          )}

          <div className="flex gap-2">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'read' | 'write' | 'admin')}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-gray-500 outline-none"
              disabled={submitting}
            >
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={submitting || (!isPublic && !email.trim())}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Sharing...' : 'Share'}
            </button>
          </div>
        </form>

        {/* Current shares */}
        <div>
          <h4 className="text-sm text-gray-400 mb-2">Shared with</h4>
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : shares.length === 0 ? (
            <p className="text-gray-500 text-sm">Not shared with anyone yet.</p>
          ) : (
            <div className="space-y-2">
              {shares.map(share => (
                <div key={share.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                  <div>
                    {share.target_type === 'public' ? (
                      <span className="text-green-400">🌐 Public</span>
                    ) : (
                      <span>{share.target_email || share.target_name || 'Unknown user'}</span>
                    )}
                    <span className="text-gray-500 text-sm ml-2">({share.permission})</span>
                  </div>
                  <button
                    onClick={() => handleDelete(share.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

