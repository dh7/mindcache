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

// Document editor component
function DocumentEditor({
  id,
  mc,
  color
}: {
  id: string;
  mc: MindCache | null;
  color: string;
}) {
  const [text, setText] = useState('');

  // Subscribe to document changes
  useEffect(() => {
    if (!mc) {
      return;
    }

    // Get initial text
    const initialText = mc.get_document_text('shared_doc') || '';
    setText(initialText);

    // Get Y.Text and subscribe to changes
    const yText = mc.get_document('shared_doc');
    if (yText) {
      const handler = () => {
        setText(yText.toString());
      };
      yText.observe(handler);
      return () => yText.unobserve(handler);
    }
  }, [mc]);

  const handleChange = useCallback((newText: string) => {
    if (!mc) {
      return;
    }
    mc.replace_document_text('shared_doc', newText);
    setText(newText);
  }, [mc]);

  return (
    <div className={`flex-1 p-4 rounded-xl border-2 ${color} bg-gray-800/50 backdrop-blur`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Editor {id}</h2>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-gray-400">Synced</span>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Start typing... changes sync in real-time!"
        className="w-full h-64 p-4 bg-gray-900 border border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-gray-200 placeholder-gray-500"
      />

      <div className="mt-2 text-xs text-gray-500">
        {text.length} characters
      </div>
    </div>
  );
}

export default function Home() {
  const [instanceId, setInstanceId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const mindCacheRef = useRef<MindCache | null>(null);

  // Load saved credentials from cookies on mount
  useEffect(() => {
    const savedInstanceId = getCookie('mc_collab_instance_id');
    const savedApiKey = getCookie('mc_collab_api_key');
    if (savedInstanceId) setInstanceId(savedInstanceId);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  const log = (msg: string) => setLogs(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50));

  const handleConnect = async () => {
    if (!instanceId || !apiKey) return;

    // Save credentials to cookies
    setCookie('mc_collab_instance_id', instanceId);
    setCookie('mc_collab_api_key', apiKey);

    try {
      log('Initializing MindCache...');
      const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL || 'https://api.mindcache.dev';

      const mc = new MindCache({
        cloud: {
          instanceId,
          apiKey,
          baseUrl
        }
      });

      log('Waiting for sync...');
      await mc.waitForSync();
      log('Connected and synced!');

      // Initialize document if not exists
      if (!mc.get_document('shared_doc')) {
        log('Creating new shared document...');
        mc.set_document('shared_doc', '# Welcome to MindCache Collaborative Document!\n\nType in either editor and watch changes appear in real-time across all connected clients.\n\n## Features\n- Character-level CRDT sync\n- Diff-based updates (minimal data transfer)\n- Conflict-free merging\n- Cloud persistence\n');
      } else {
        log(`Loaded existing document: ${mc.get_document_text('shared_doc')?.slice(0, 50)}...`);
      }

      mindCacheRef.current = mc;
      setConnected(true);
    } catch (e) {
      log(`Error connecting: ${e}`);
      console.error(e);
      alert(`Failed to connect: ${e}`);
    }
  };

  // Connection form (not connected yet)
  if (!connected) {
    return (
      <div className="min-h-screen p-8 font-sans bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex items-center justify-center">
        <main className="w-full max-w-xl bg-gray-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-gray-700/50">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MindCache Collaborative Document
            </h1>
            <p className="text-gray-400">Real-time document sync with Y.Text CRDT</p>
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-300 ms-1">Instance ID</label>
              <input
                id="instance-id-input"
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
                id="api-key-input"
                type="text"
                placeholder="e.g. sk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full border border-gray-600 bg-gray-900 p-3 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            <button
              id="connect-btn"
              onClick={handleConnect}
              disabled={!instanceId || !apiKey}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3.5 rounded-lg font-bold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl mt-2"
            >
              Connect & Start Editing
            </button>
          </div>

          <div className="mt-8 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">How it works</h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• Enter your MindCache Cloud credentials</li>
              <li>• Open this page in multiple browser windows</li>
              <li>• Type in any editor - changes sync instantly!</li>
              <li>• Document is persisted in the cloud</li>
            </ul>
          </div>
        </main>
      </div>
    );
  }

  // Connected state - show dual editors
  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            MindCache Collaborative Document
          </h1>
          <p className="text-gray-400">
            Real-time document sync with Y.Text CRDT
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-gray-400">Connected to Cloud</span>
            </div>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">Instance: <code className="text-blue-400">{instanceId}</code></span>
            <button
              onClick={() => window.location.reload()}
              className="text-gray-400 text-xs hover:text-gray-200 underline transition-colors ml-4"
            >
              Disconnect
            </button>
          </div>
        </header>

        <div className="mb-4 text-center text-sm text-gray-500">
          Open this page in another browser window to see real-time collaboration in action!
        </div>

        <div className="flex gap-6">
          <DocumentEditor
            id="A"
            mc={mindCacheRef.current}
            color="border-blue-500/50"
          />
          <DocumentEditor
            id="B"
            mc={mindCacheRef.current}
            color="border-purple-500/50"
          />
        </div>

        {/* Activity Log */}
        <div className="mt-8 bg-gray-900 text-green-400 p-4 rounded-xl h-32 overflow-auto text-xs font-mono border border-gray-700/50">
          <div className="text-gray-500 mb-2 font-semibold">Activity Log</div>
          {logs.map((l, i) => (
            <div key={i} className="mb-1 opacity-80 hover:opacity-100 transition-opacity">
              <span className="text-gray-500 mr-2">{l.split(' ')[0]}</span>
              {l.split(' ').slice(1).join(' ')}
            </div>
          ))}
        </div>

        <div className="mt-6 p-6 bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50">
          <h3 className="text-lg font-semibold mb-4 text-white">How it works</h3>
          <ul className="list-disc list-inside space-y-2 text-gray-300 text-sm">
            <li>Both editors share the same <code className="text-green-400">MindCache</code> instance connected to cloud</li>
            <li>The document uses <code className="text-green-400">Y.Text</code> CRDT for conflict-free merging</li>
            <li>Changes are diff-based (small edits don&apos;t replace entire document)</li>
            <li>Open in another browser/device with same credentials to see true real-time sync!</li>
            <li>All changes are persisted to your MindCache Cloud instance</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
