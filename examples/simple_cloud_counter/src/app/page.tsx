"use client";

import { useState, useEffect, useRef } from 'react';
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

export default function Home() {
  const [instanceId, setInstanceId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const mindCacheRef = useRef<MindCache | null>(null);

  // Load saved credentials from cookies on mount
  useEffect(() => {
    const savedInstanceId = getCookie('mc_instance_id');
    const savedApiKey = getCookie('mc_api_key');
    if (savedInstanceId) setInstanceId(savedInstanceId);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  const log = (msg: string) => setLogs(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50));

  const handleConnect = async () => {
    if (!instanceId || !apiKey) return;

    // Save credentials to cookies
    setCookie('mc_instance_id', instanceId);
    setCookie('mc_api_key', apiKey);

    try {
      log('Initializing MindCache...');
      const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL;
      if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_MINDCACHE_API_URL environment variable is not set');
      }

      // SDK automatically:
      // 1. Fetches a short-lived token from the API using the apiKey
      // 2. Connects to WebSocket with the token
      const mc = new MindCache({
        cloud: {
          instanceId,
          apiKey,
          baseUrl  // SDK handles HTTP→WSS conversion internally
        }
      });

      log('Waiting for sync...');
      await mc.waitForSync();
      log('Connected and synced!');

      const current = mc.get_value('counter');
      log(`Initial counter value: ${current}`);
      setCount(Number(current) || 0);

      mc.subscribe('counter', (val: any) => {
        log(`Counter updated: ${val}`);
        setCount(Number(val) || 0);
      });

      mindCacheRef.current = mc;
      setConnected(true);
    } catch (e) {
      log(`Error connecting: ${e}`);
      console.error(e);
      alert(`Failed to connect: ${e}`);
    }
  };

  useEffect(() => {
    if (!connected || !mindCacheRef.current) return;

    // Start incrementing every second
    const interval = setInterval(() => {
      const mc = mindCacheRef.current!;
      try {
        // Get current value from local state (synced with cloud)
        const val = mc.get_value('counter');
        const next = (Number(val) || 0) + 1;

        // Set new value (syncs to cloud automatically)
        mc.set_value('counter', next);

        // Note: The subscribe listener will update the React state `time` 
        // and `logs` when this set happens.
      } catch (e) {
        log(`Error incrementing: ${e}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connected]);

  return (
    <div className="min-h-screen p-8 font-sans bg-gray-50 text-gray-900 flex items-center justify-center">
      <main className="w-full max-w-xl bg-white p-8 rounded-xl shadow-2xl border border-gray-100">
        <h1 className="text-3xl font-bold mb-2 text-indigo-600 text-center">MindCache Cloud</h1>
        <p className="text-center text-gray-500 mb-8">Simple Cloud Counter Example</p>

        {!connected ? (
          <div className="flex flex-col gap-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 ms-1">Instance ID</label>
              <input
                id="instance-id-input"
                type="text"
                placeholder="e.g. inst_..."
                value={instanceId}
                onChange={e => setInstanceId(e.target.value)}
                className="w-full border border-gray-300 bg-gray-50 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 ms-1">API Key</label>
              <input
                id="api-key-input"
                type="text"
                placeholder="e.g. sk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full border border-gray-300 bg-gray-50 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <button
              id="connect-btn"
              onClick={handleConnect}
              disabled={!instanceId || !apiKey}
              className="w-full bg-indigo-600 text-white p-3.5 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg mt-2"
            >
              Connect & Start
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8 animate-in fade-in zoom-in duration-300">
            <div className="text-center p-10 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 shadow-inner">
              <div className="text-indigo-400 mb-3 uppercase tracking-widest text-xs font-bold">Live Counter</div>
              <div className="text-7xl font-black text-indigo-600 tabular-nums tracking-tighter drop-shadow-sm">{count ?? '-'}</div>
              <div className="text-sm text-indigo-400 mt-3 font-medium">Syncing with Cloud...</div>
            </div>

            <div className="bg-gray-900 text-green-400 p-4 rounded-xl h-48 overflow-auto text-xs font-mono shadow-inner border border-gray-800">
              {logs.map((l, i) => (
                <div key={i} className="mb-1.5 border-b border-gray-800/50 pb-1.5 last:border-0 last:pb-0 break-all opacity-80 hover:opacity-100 transition-opacity">
                  <span className="text-gray-500 mr-2">{l.split(' ')[0]}</span>
                  {l.split(' ').slice(1).join(' ')}
                </div>
              ))}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="text-gray-400 text-xs hover:text-gray-600 underline self-center transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
