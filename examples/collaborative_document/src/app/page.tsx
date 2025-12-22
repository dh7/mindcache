'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MindCache } from 'mindcache';

// Cookie helpers
function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

// Connection status badge component
function ConnectionBadge({
  state,
  isOnline
}: {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  isOnline: boolean;
}) {
  if (!isOnline) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-600 text-white font-semibold text-sm shadow-lg animate-pulse">
        <span className="text-lg">📡</span>
        <span>Network Offline</span>
      </div>
    );
  }

  const config = {
    disconnected: { bg: 'bg-gray-600', text: 'Disconnected', icon: '○', pulse: false },
    connecting: { bg: 'bg-yellow-500', text: 'Connecting...', icon: '◐', pulse: true },
    connected: { bg: 'bg-green-500', text: 'Connected to Cloud', icon: '●', pulse: true },
    error: { bg: 'bg-red-500', text: 'Connection Error', icon: '✕', pulse: false },
  };

  const { bg, text, icon, pulse } = config[state];

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${bg} text-white font-semibold text-sm shadow-lg`}>
      <span className={`text-lg ${pulse ? 'animate-pulse' : ''}`}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

export default function Home() {
  const [instanceId, setInstanceId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [hasEverConnected, setHasEverConnected] = useState(false); // Stay in editor view once connected
  const [isOnline, setIsOnline] = useState(true);
  const [text, setText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const mindCacheRef = useRef<MindCache | null>(null);

  // Load saved credentials from cookies on mount
  useEffect(() => {
    const savedInstanceId = getCookie('mc_collab_instance_id');
    const savedApiKey = getCookie('mc_collab_api_key');
    if (savedInstanceId) setInstanceId(savedInstanceId);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  // Browser online/offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setLogs(prev => [`${new Date().toLocaleTimeString()} 🌐 Network: Back online`, ...prev].slice(0, 50));
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLogs(prev => [`${new Date().toLocaleTimeString()} ⚠️ Network: Offline`, ...prev].slice(0, 50));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const log = (msg: string) => {
    setLogs(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50));
  };

  const handleConnect = async () => {
    if (!instanceId || !apiKey) return;

    setCookie('mc_collab_instance_id', instanceId);
    setCookie('mc_collab_api_key', apiKey);

    setConnectionState('connecting');
    log('Initializing MindCache...');

    try {
      const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL || 'https://api.mindcache.dev';

      const mc = new MindCache({
        cloud: { instanceId, apiKey, baseUrl }
      });

      log('Connecting to cloud...');
      await mc.waitForSync();

      setConnectionState('connected');
      setHasEverConnected(true); // Once connected, stay in editor view
      setLastSyncTime(new Date());
      log('✓ Connected and synced!');

      // Initialize document if not exists
      if (!mc.get_document('shared_doc')) {
        log('Creating new shared document...');
        mc.set_document('shared_doc', '# Welcome to MindCache Collaborative Document!\n\nThis document syncs in real-time across all connected clients.\n\n## Try it out\n1. Open this page in another browser window\n2. Use the same Instance ID and API Key\n3. Start typing and watch the magic!\n');
      }

      // Get initial text
      const initialText = mc.get_value('shared_doc') || '';
      setText(initialText);
      log(`Loaded document (${initialText.length} chars)`);

      // Subscribe to document changes
      const yText = mc.get_document('shared_doc');
      if (yText) {
        yText.observe(() => {
          setText(yText.toString());
          setLastSyncTime(new Date());
        });
      }

      // Subscribe to connection state changes
      mc.subscribeToAll(() => {
        setConnectionState(mc.connectionState as 'disconnected' | 'connecting' | 'connected' | 'error');
        if (mc.connectionState === 'connected') {
          setLastSyncTime(new Date());
        }
      });

      mindCacheRef.current = mc;
    } catch (e) {
      setConnectionState('error');
      log(`✗ Error connecting: ${e}`);
      console.error(e);
    }
  };

  const handleTextChange = useCallback((newText: string) => {
    if (!mindCacheRef.current) return;
    mindCacheRef.current.set_value('shared_doc', newText);
    setText(newText);
  }, []);

  // Undo using MindCache's built-in undo
  const handleUndo = useCallback(() => {
    if (!mindCacheRef.current) return;
    mindCacheRef.current.undo('shared_doc');
    const newText = mindCacheRef.current.get_value('shared_doc') || '';
    setText(newText);
    log('↩️ Undo');
  }, []);

  // Redo using MindCache's built-in redo
  const handleRedo = useCallback(() => {
    if (!mindCacheRef.current) return;
    mindCacheRef.current.redo('shared_doc');
    const newText = mindCacheRef.current.get_value('shared_doc') || '';
    setText(newText);
    log('↪️ Redo');
  }, []);

  const handleDisconnect = () => {
    if (mindCacheRef.current) {
      mindCacheRef.current.disconnect();
      mindCacheRef.current = null;
    }
    setConnectionState('disconnected');
    setHasEverConnected(false); // Go back to login form
    setText('');
    log('Disconnected from cloud');
  };

  // Connection form - only show if user has never connected yet
  // Once connected, stay in editor view even if connection drops (offline editing)
  if (!hasEverConnected && (connectionState === 'disconnected' || connectionState === 'error')) {
    return (
      <div className="min-h-screen p-8 font-sans bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex items-center justify-center">
        <main className="w-full max-w-xl bg-gray-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-gray-700/50">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MindCache Collaborative Document
            </h1>
            <p className="text-gray-400">Real-time document sync with Y.Text CRDT</p>
            <div className="mt-4">
              <ConnectionBadge state={connectionState} isOnline={isOnline} />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-300 ms-1">Instance ID</label>
              <input
                type="text"
                placeholder="e.g. inst_..."
                value={instanceId}
                onChange={e => setInstanceId(e.target.value)}
                className="w-full border border-gray-600 bg-gray-900 p-3 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-300 ms-1">API Key</label>
              <input
                type="text"
                placeholder="e.g. sk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full border border-gray-600 bg-gray-900 p-3 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={!instanceId || !apiKey}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3.5 rounded-lg font-bold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl mt-2"
            >
              Connect to Cloud
            </button>
          </div>

          <div className="mt-8 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">🌐 Test Real-Time Collaboration</h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>1. Connect with your MindCache Cloud credentials</li>
              <li>2. Open this page in <strong className="text-white">another browser window</strong></li>
              <li>3. Enter the same credentials in both windows</li>
              <li>4. Type in one window - changes appear instantly in the other!</li>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  // Connecting state - only show during initial connection
  if (!hasEverConnected && connectionState === 'connecting') {
    return (
      <div className="min-h-screen p-8 font-sans bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex items-center justify-center">
        <main className="text-center">
          <div className="mb-6">
            <ConnectionBadge state="connecting" isOnline={isOnline} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Connecting to MindCache Cloud...</h1>
          <p className="text-gray-400">Establishing WebSocket connection</p>
          <div className="mt-8 animate-spin text-4xl">◌</div>
        </main>
      </div>
    );
  }

  // Connected - show editor
  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Collaborative Document
            </h1>
            <div className="flex items-center gap-4">
              <ConnectionBadge state={connectionState} isOnline={isOnline} />
              <button
                onClick={handleDisconnect}
                className="text-gray-400 text-sm hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          {/* Connection details bar */}
          <div className="flex items-center gap-6 text-sm text-gray-400 bg-gray-800/50 px-4 py-2 rounded-lg">
            <span>
              Instance: <code className="text-blue-400">{instanceId}</code>
            </span>
            <span className="text-gray-600">|</span>
            <span>
              Last sync: <span className="text-green-400">{lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}</span>
            </span>
            <span className="text-gray-600">|</span>
            <span>{text.length} characters</span>
          </div>
        </header>

        {/* Collaboration tip */}
        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-blue-300 text-sm flex items-center gap-2">
          <span className="text-lg">💡</span>
          <span>
            Open this page in <strong>another browser window</strong> with the same credentials to see real-time sync!
          </span>
        </div>

        {/* Offline mode banner */}
        {!isOnline && (
          <div className="mb-4 p-3 bg-orange-900/40 border border-orange-600/50 rounded-lg text-orange-300 text-sm flex items-center gap-2">
            <span className="text-lg">📴</span>
            <span>
              <strong>Offline Mode</strong> - Keep editing! Your changes are saved locally and will sync when you&apos;re back online.
            </span>
          </div>
        )}

        {/* Main editor */}
        <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 p-6">
          {/* Toolbar with Undo/Redo */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              title="Undo (uses MindCache.undo)"
            >
              <span>↩️</span>
              <span>Undo</span>
            </button>
            <button
              onClick={handleRedo}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              title="Redo (uses MindCache.redo)"
            >
              <span>↪️</span>
              <span>Redo</span>
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Start typing... your changes sync to the cloud in real-time!"
            className="w-full h-96 p-4 bg-gray-900 border border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-gray-200 placeholder-gray-500 text-sm leading-relaxed"
          />
        </div>

        {/* Activity Log */}
        <div className="mt-6 bg-gray-900 text-green-400 p-4 rounded-xl h-32 overflow-auto text-xs font-mono border border-gray-700/50">
          <div className="text-gray-500 mb-2 font-semibold flex items-center gap-2">
            <span>📡</span> Activity Log
          </div>
          {logs.map((l, i) => (
            <div key={i} className="mb-1 opacity-80 hover:opacity-100 transition-opacity">
              <span className="text-gray-500 mr-2">{l.split(' ')[0]}</span>
              {l.split(' ').slice(1).join(' ')}
            </div>
          ))}
        </div>

        {/* Info section */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50">
            <h3 className="font-semibold mb-2 text-white flex items-center gap-2">
              <span>⚡</span> Real-Time Sync
            </h3>
            <p className="text-xs text-gray-400">
              Changes sync instantly via WebSocket. The document is persisted in MindCache Cloud.
            </p>
          </div>
          <div className="p-4 bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50">
            <h3 className="font-semibold mb-2 text-white flex items-center gap-2">
              <span>🔀</span> Conflict-Free
            </h3>
            <p className="text-xs text-gray-400">
              Uses Y.Text CRDT - multiple users can edit simultaneously without conflicts.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
