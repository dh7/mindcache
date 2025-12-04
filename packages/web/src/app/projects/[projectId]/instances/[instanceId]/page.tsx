'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

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

  const [keys, setKeys] = useState<SyncData>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'write' | 'admin'>('read');
  
  // New key form
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyType, setNewKeyType] = useState<'text' | 'json'>('text');

  // Edit key
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    const token = await getToken() || 'test'; // 'test' for dev mode
    const ws = new WebSocket(`${WS_URL}/sync/${instanceId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', apiKey: token }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log('Received message:', msg);
      
      switch (msg.type) {
        case 'auth_success':
          setConnected(true);
          setPermission(msg.permission);
          setError(null);
          break;
        case 'auth_error':
          setError(msg.error);
          setConnected(false);
          break;
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

  const handleSaveEdit = (key: string) => {
    const entry = keys[key];
    if (!entry) return;

    let value: unknown = editValue;
    if (entry.attributes.type === 'json') {
      try {
        value = JSON.parse(editValue);
      } catch {
        alert('Invalid JSON');
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

    setEditingKey(null);
  };

  const handleDeleteKey = (key: string) => {
    if (!confirm(`Delete key "${key}"?`)) return;
    sendMessage({
      type: 'delete',
      key,
      timestamp: Date.now(),
    });
  };

  const startEditing = (key: string) => {
    const entry = keys[key];
    if (!entry) return;
    setEditingKey(key);
    setEditValue(
      entry.attributes.type === 'json'
        ? JSON.stringify(entry.value, null, 2)
        : String(entry.value ?? '')
    );
  };

  const canEdit = permission === 'write' || permission === 'admin';

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}`}
            className="text-blue-400 hover:underline mb-2 inline-block"
          >
            ← Back to Project
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold">Instance Editor</h1>
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
          </div>
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>

        {/* Add Key Button */}
        {canEdit && (
          <div className="mb-4">
            <button
              onClick={() => setShowAddKey(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              + Add Key
            </button>
          </div>
        )}

        {/* Keys List */}
        <div className="space-y-3">
          {Object.keys(keys).length === 0 ? (
            <div className="text-gray-500 text-center py-8 border border-gray-700 rounded-lg">
              No keys yet. {canEdit ? 'Add one to get started.' : ''}
            </div>
          ) : (
            Object.entries(keys).map(([key, entry]) => (
              <div
                key={key}
                className="bg-gray-900 border border-gray-700 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-mono font-bold text-blue-400">{key}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {entry.attributes.type}
                      {entry.attributes.readonly && ' • readonly'}
                    </span>
                    {entry.attributes.tags && entry.attributes.tags.length > 0 && (
                      <span className="ml-2">
                        {entry.attributes.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1 py-0.5 text-xs bg-gray-700 rounded mr-1"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {canEdit && !entry.attributes.readonly && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(key)}
                        className="text-xs px-2 py-1 bg-blue-600 rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key)}
                        className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {editingKey === key ? (
                  <div>
                    <textarea
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm"
                      rows={entry.attributes.type === 'json' ? 6 : 2}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(key)}
                        className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingKey(null)}
                        className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="text-sm text-gray-300 bg-gray-800 p-2 rounded overflow-x-auto">
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

