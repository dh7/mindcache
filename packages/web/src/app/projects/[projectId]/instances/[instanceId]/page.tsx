'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

interface Instance {
  id: string;
  name: string;
  is_readonly: number;
}

interface KeyEntry {
  value: unknown;
  attributes: {
    readonly: boolean;
    visible: boolean;
    hardcoded: boolean;
    template: boolean;
    type: 'text' | 'image' | 'file' | 'json';
    contentType?: string;
    tags?: string[];
  };
  updatedAt?: number;
}

type SyncData = Record<string, KeyEntry>;

// Use WSS for production, WS for localhost
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');

export default function InstanceEditorPage() {
  const params = useParams();
  const { getToken } = useAuth();
  const projectId = params.projectId as string;
  const instanceId = params.instanceId as string;

  const [instance, setInstance] = useState<Instance | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [keys, setKeys] = useState<SyncData>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'write' | 'admin'>('read');
  
  // New key form
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyType, setNewKeyType] = useState<'text' | 'json'>('text');

  // Track which keys have unsaved changes
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Fetch instance metadata from list endpoint
  useEffect(() => {
    const fetchInstance = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const found = data.instances?.find((i: Instance) => i.id === instanceId);
          if (found) {
            setInstance(found);
            setInstanceName(found.name);
          }
        }
      } catch (err) {
        console.error('Failed to fetch instance:', err);
      }
    };
    fetchInstance();
  }, [projectId, instanceId, getToken]);

  const handleUpdateInstanceName = async () => {
    if (!instanceName.trim() || instanceName === instance?.name) {
      setEditingName(false);
      return;
    }
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/instances/${instanceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: instanceName }),
      });
      if (res.ok) {
        const updated = await res.json();
        setInstance(prev => prev ? { ...prev, name: updated.name } : null);
        setInstanceName(updated.name);
      }
    } catch (err) {
      console.error('Failed to update instance name:', err);
    }
    setEditingName(false);
  };

  const connect = useCallback(async () => {
    try {
      // Get short-lived WS token from API
      const jwtToken = await getToken();
      const res = await fetch(`${API_URL}/api/ws-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({ instanceId }),
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to get token' }));
        setError(err.details || err.error || 'Failed to authenticate');
        return;
      }
      
      const { token: wsToken, permission: perm } = await res.json();
      
      // Connect with token in URL (server validates before upgrade)
      const ws = new WebSocket(`${WS_URL}/sync/${instanceId}?token=${wsToken}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Auth already verified by server, wait for sync message
        setConnected(true);
        setPermission(perm);
        setError(null);
      };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log('Received message:', msg);
      
      switch (msg.type) {
        case 'sync':
          setKeys(msg.data || {});
          break;
        case 'key_updated':
          setKeys(prev => ({
            ...prev,
            [msg.key]: {
              value: msg.value,
              attributes: msg.attributes,
              updatedAt: msg.timestamp,
            },
          }));
          break;
        case 'key_deleted':
          setKeys(prev => {
            const next = { ...prev };
            delete next[msg.key];
            return next;
          });
          break;
        case 'cleared':
          setKeys({});
          break;
        case 'error':
          console.error('Server error:', msg.error);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setError('Connection error');
    };
    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [instanceId, getToken]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = (msg: object) => {
    console.log('Sending message:', msg, 'WebSocket state:', wsRef.current?.readyState);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      console.log('Message sent successfully');
    } else {
      console.error('WebSocket not open, cannot send');
    }
  };

  const handleAddKey = () => {
    if (!newKeyName.trim()) return;
    
    let value: unknown = newKeyValue;
    if (newKeyType === 'json') {
      try {
        value = JSON.parse(newKeyValue);
      } catch {
        alert('Invalid JSON');
        return;
      }
    }

    sendMessage({
      type: 'set',
      key: newKeyName,
      value,
      attributes: {
        readonly: false,
        visible: true,
        hardcoded: false,
        template: false,
        type: newKeyType,
        tags: [],
      },
      timestamp: Date.now(),
    });

    setNewKeyName('');
    setNewKeyValue('');
    setShowAddKey(false);
  };

  // Initialize keyValues when keys change from server
  useEffect(() => {
    const newKeyValues: Record<string, string> = {};
    for (const [key, entry] of Object.entries(keys)) {
      if (!(key in keyValues)) {
        newKeyValues[key] = entry.attributes.type === 'json'
          ? JSON.stringify(entry.value, null, 2)
          : String(entry.value ?? '');
      }
    }
    if (Object.keys(newKeyValues).length > 0) {
      setKeyValues(prev => ({ ...prev, ...newKeyValues }));
    }
  }, [keys]);

  const handleKeyValueChange = (key: string, newValue: string) => {
    setKeyValues(prev => ({ ...prev, [key]: newValue }));
    
    // Clear existing timeout for this key
    if (saveTimeoutRef.current[key]) {
      clearTimeout(saveTimeoutRef.current[key]);
    }
    
    // Debounce save - auto-save after 500ms of no typing
    saveTimeoutRef.current[key] = setTimeout(() => {
      saveKeyValue(key, newValue);
    }, 500);
  };

  const saveKeyValue = (key: string, valueStr: string) => {
    const entry = keys[key];
    if (!entry) return;

    let value: unknown = valueStr;
    if (entry.attributes.type === 'json') {
      try {
        value = JSON.parse(valueStr);
      } catch {
        // Invalid JSON - don't save
        return;
      }
    }

    sendMessage({
      type: 'set',
      key,
      value,
      attributes: entry.attributes,
      timestamp: Date.now(),
    });
  };

  const handleDeleteKey = (key: string) => {
    if (!confirm(`Delete key "${key}"?`)) return;
    sendMessage({
      type: 'delete',
      key,
      timestamp: Date.now(),
    });
    // Clean up local state
    setKeyValues(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const canEdit = permission === 'write' || permission === 'admin';

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Instance Header with Editable Name */}
        <div className="mb-6 mt-2">
          <div className="flex items-center gap-3 mb-2">
            {editingName ? (
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                onBlur={handleUpdateInstanceName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateInstanceName();
                  if (e.key === 'Escape') {
                    setInstanceName(instance?.name || '');
                    setEditingName(false);
                  }
                }}
                className="text-2xl font-semibold bg-transparent border-b-2 border-zinc-500 outline-none px-1"
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-semibold cursor-pointer hover:text-zinc-300 transition group flex items-center gap-2"
                onClick={() => canEdit && setEditingName(true)}
                title={canEdit ? 'Click to edit name' : undefined}
              >
                {instance?.name || 'Loading...'}
                {canEdit && (
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </h1>
            )}
          </div>
          
          {/* Status bar */}
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-1 text-xs rounded ${
                connected ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
            {connected && (
              <span className="px-2 py-1 text-xs bg-gray-700 rounded">
                {permission}
              </span>
            )}
            {error && <span className="text-red-500 text-sm ml-2">{error}</span>}
          </div>
        </div>

        {/* Add Key Button */}
        {canEdit && (
          <div className="mb-4">
            <button
              onClick={() => setShowAddKey(true)}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition"
            >
              + Add Key
            </button>
          </div>
        )}

        {/* Keys List */}
        <div className="space-y-3">
          {Object.keys(keys).length === 0 ? (
            <div className="text-zinc-500 text-center py-8 border border-zinc-800 rounded-lg">
              No keys yet. {canEdit ? 'Add one to get started.' : ''}
            </div>
          ) : (
            Object.entries(keys).map(([key, entry]) => (
              <div
                key={key}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-mono font-bold text-blue-400">{key}</span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {entry.attributes.type}
                      {entry.attributes.readonly && ' • readonly'}
                    </span>
                    {entry.attributes.tags && entry.attributes.tags.length > 0 && (
                      <span className="ml-2">
                        {entry.attributes.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1 py-0.5 text-xs bg-zinc-700 rounded mr-1"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {canEdit && !entry.attributes.readonly && (
                    <button
                      onClick={() => handleDeleteKey(key)}
                      className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>

                {canEdit && !entry.attributes.readonly ? (
                  <textarea
                    className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded font-mono text-sm text-zinc-300 focus:border-zinc-500 outline-none resize-y"
                    rows={entry.attributes.type === 'json' ? 6 : 2}
                    value={keyValues[key] ?? ''}
                    onChange={(e) => handleKeyValueChange(key, e.target.value)}
                    placeholder="Enter value..."
                  />
                ) : (
                  <pre className="text-sm text-zinc-300 bg-zinc-800 p-2 rounded overflow-x-auto">
                    {entry.attributes.type === 'json'
                      ? JSON.stringify(entry.value, null, 2)
                      : String(entry.value ?? '')}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add Key Modal */}
        {showAddKey && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Add New Key</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="my_key"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value as 'text' | 'json')}
                  >
                    <option value="text">Text</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Value</label>
                  <textarea
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded font-mono text-sm"
                    rows={4}
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    placeholder={newKeyType === 'json' ? '{ "key": "value" }' : 'Enter value...'}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddKey(false)}
                  className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddKey}
                  className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700"
                  disabled={!newKeyName.trim()}
                >
                  Add Key
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

