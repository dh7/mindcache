'use client';

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

// Connection status badge
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
        connected: { bg: 'bg-green-500', text: 'Connected', icon: '●', pulse: false },
        error: { bg: 'bg-red-500', text: 'Error', icon: '✕', pulse: false },
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
    const [isOnline, setIsOnline] = useState(true);
    const [text, setText] = useState('');
    const [savedText, setSavedText] = useState('');
    const [logs, setLogs] = useState<string[]>([]);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [hasEverConnected, setHasEverConnected] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const mindCacheRef = useRef<MindCache | null>(null);
    const hasUnsavedChangesRef = useRef(false);
    const textRef = useRef('');
    const savedTextRef = useRef('');

    // Load saved credentials from cookies
    useEffect(() => {
        const savedInstanceId = getCookie('mc_simple_doc_instance');
        const savedApiKey = getCookie('mc_simple_doc_api_key');
        if (savedInstanceId) setInstanceId(savedInstanceId);
        if (savedApiKey) setApiKey(savedApiKey);
    }, []);

    // Browser online/offline detection
    useEffect(() => {
        setIsOnline(navigator.onLine);

        const handleOnline = () => {
            setIsOnline(true);
            log('🌐 Network: Back online');
        };

        const handleOffline = () => {
            setIsOnline(false);
            log('⚠️ Network: Offline');
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

        setCookie('mc_simple_doc_instance', instanceId);
        setCookie('mc_simple_doc_api_key', apiKey);

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

            // Ensure the document exists (creates if not present)
            if (!mc.get_document('shared_doc')) {
                mc.set_value('shared_doc', '', { type: 'document' });
            }

            // Get initial text
            const initialText = mc.get_value('shared_doc') || '';
            setText(initialText);
            textRef.current = initialText;
            setSavedText(initialText);
            savedTextRef.current = initialText;
            log(`Loaded document (${initialText.length} chars)`);

            // Subscribe to changes from other clients
            // When someone saves, all connected clients see it immediately
            mc.subscribe('shared_doc', (cloudText: unknown) => {
                const newCloudText = String(cloudText ?? '');

                // Always update the editor with cloud state
                setText(newCloudText);
                textRef.current = newCloudText;
                setSavedText(newCloudText);
                savedTextRef.current = newCloudText;
                setHasUnsavedChanges(false);
                hasUnsavedChangesRef.current = false;
                setLastSyncTime(new Date());

                log('📥 Document updated from cloud');
            });

            // Subscribe to connection state
            mc.subscribeToAll(() => {
                setConnectionState(mc.connectionState as 'disconnected' | 'connecting' | 'connected' | 'error');
            });

            mindCacheRef.current = mc;
        } catch (e) {
            setConnectionState('error');
            log(`✗ Error connecting: ${e}`);
            console.error(e);
        }
    };

    const handleTextChange = (newText: string) => {
        setText(newText);
        textRef.current = newText;
        const hasChanges = newText !== savedTextRef.current;
        setHasUnsavedChanges(hasChanges);
        hasUnsavedChangesRef.current = hasChanges;
    };

    const handleSave = async () => {
        if (!mindCacheRef.current || !hasUnsavedChanges) return;

        setIsSaving(true);
        log('💾 Saving document...');

        try {
            // Use set_value which handles both creating new keys and updating existing ones
            mindCacheRef.current.set_value('shared_doc', text);

            // After save, read back the merged result (in case other changes came in)
            const mergedText = mindCacheRef.current.get_value('shared_doc') || text;

            setText(mergedText);
            textRef.current = mergedText;
            setSavedText(mergedText);
            savedTextRef.current = mergedText;
            setHasUnsavedChanges(false);
            hasUnsavedChangesRef.current = false;
            setLastSyncTime(new Date());
            log(`✓ Saved (${mergedText.length} chars)`);
        } catch (e) {
            log(`✗ Save failed: ${e}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        setText(savedTextRef.current);
        textRef.current = savedTextRef.current;
        setHasUnsavedChanges(false);
        hasUnsavedChangesRef.current = false;
        log('↩️ Changes discarded');
    };

    const handleDisconnect = () => {
        if (mindCacheRef.current) {
            mindCacheRef.current.disconnect();
            mindCacheRef.current = null;
        }
        setConnectionState('disconnected');
        setText('');
        setSavedText('');
        setHasUnsavedChanges(false);
        log('Disconnected');
    };

    // Connection form - only show if user has never connected yet
    // Once connected, stay in editor view even if connection drops (offline editing)
    if (!hasEverConnected && (connectionState === 'disconnected' || connectionState === 'error')) {
        return (
            <div className="min-h-screen p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100 flex items-center justify-center">
                <main className="w-full max-w-xl bg-slate-800/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-slate-700/50">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                            Simple Document Editor
                        </h1>
                        <p className="text-gray-400">Save on demand with MindCache Cloud</p>
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
                                className="w-full border border-slate-600 bg-slate-900 p-3 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-gray-300 ms-1">API Key</label>
                            <input
                                type="text"
                                placeholder="e.g. sk_..."
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                className="w-full border border-slate-600 bg-slate-900 p-3 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleConnect}
                            disabled={!instanceId || !apiKey}
                            className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white p-3.5 rounded-lg font-bold hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl mt-2"
                        >
                            Connect
                        </button>
                    </div>

                    <div className="mt-8 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                        <h3 className="text-sm font-semibold text-gray-300 mb-2">💡 How This Example Works</h3>
                        <ul className="text-xs text-gray-400 space-y-1">
                            <li>• Edit the document locally without auto-saving</li>
                            <li>• Click <strong className="text-emerald-400">Save</strong> to sync to cloud</li>
                            <li>• Uses <code className="text-cyan-400">set_value()</code> instead of real-time sync</li>
                            <li>• Other clients will see updates after you save</li>
                        </ul>
                    </div>
                </main>
            </div>
        );
    }

    // Connecting state - only show during initial connection
    if (!hasEverConnected && connectionState === 'connecting') {
        return (
            <div className="min-h-screen p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100 flex items-center justify-center">
                <main className="text-center">
                    <div className="mb-6">
                        <ConnectionBadge state="connecting" isOnline={isOnline} />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Connecting to MindCache Cloud...</h1>
                    <div className="mt-8 animate-spin text-4xl">◌</div>
                </main>
            </div>
        );
    }

    // Connected - Editor view
    return (
        <main className="min-h-screen p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                            Simple Document Editor
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

                    {/* Status bar */}
                    <div className="flex items-center gap-6 text-sm text-gray-400 bg-slate-800/50 px-4 py-2 rounded-lg">
                        <span>
                            Instance: <code className="text-cyan-400">{instanceId}</code>
                        </span>
                        <span className="text-gray-600">|</span>
                        <span>
                            Last sync: <span className="text-emerald-400">{lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}</span>
                        </span>
                        <span className="text-gray-600">|</span>
                        <span>{text.length} characters</span>
                        {hasUnsavedChanges && (
                            <>
                                <span className="text-gray-600">|</span>
                                <span className="text-yellow-400 font-semibold">● Unsaved changes</span>
                            </>
                        )}
                    </div>
                </header>

                {/* Offline banner */}
                {!isOnline && (
                    <div className="mb-4 p-3 bg-orange-900/40 border border-orange-600/50 rounded-lg text-orange-300 text-sm flex items-center gap-2">
                        <span className="text-lg">📴</span>
                        <span>
                            <strong>Offline</strong> - You can edit locally but saves will fail until you're back online.
                        </span>
                    </div>
                )}


                {/* Editor with toolbar */}
                <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 p-6">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSave}
                                disabled={!hasUnsavedChanges || isSaving}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${hasUnsavedChanges
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg'
                                    : 'bg-slate-700 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                {isSaving ? (
                                    <>
                                        <span className="animate-spin">◌</span>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>💾</span>
                                        <span>Save</span>
                                    </>
                                )}
                            </button>
                            {hasUnsavedChanges && (
                                <button
                                    onClick={handleDiscard}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold text-sm transition-all"
                                >
                                    <span>↩️</span>
                                    <span>Discard</span>
                                </button>
                            )}
                        </div>
                        <div className="text-xs text-gray-500">
                            Press Ctrl+S / Cmd+S to save
                        </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                        value={text}
                        onChange={(e) => handleTextChange(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                e.preventDefault();
                                handleSave();
                            }
                        }}
                        placeholder="Start typing your document here..."
                        className="w-full h-96 p-4 bg-slate-900 border border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-gray-200 placeholder-gray-500 text-sm leading-relaxed"
                    />
                </div>

                {/* Activity Log */}
                <div className="mt-6 bg-slate-900 text-emerald-400 p-4 rounded-xl h-32 overflow-auto text-xs font-mono border border-slate-700/50">
                    <div className="text-gray-500 mb-2 font-semibold flex items-center gap-2">
                        <span>📋</span> Activity Log
                    </div>
                    {logs.map((l, i) => (
                        <div key={i} className="mb-1 opacity-80 hover:opacity-100 transition-opacity">
                            <span className="text-gray-500 mr-2">{l.split(' ')[0]}</span>
                            {l.split(' ').slice(1).join(' ')}
                        </div>
                    ))}
                </div>

                {/* Info */}
                <div className="mt-6 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50">
                        <h3 className="font-semibold mb-2 text-white flex items-center gap-2">
                            <span>💾</span> Save on Demand
                        </h3>
                        <p className="text-xs text-gray-400">
                            Edit locally, then click Save to sync. Uses <code className="text-cyan-400">set_value()</code> - no real-time overhead.
                        </p>
                    </div>
                    <div className="p-4 bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50">
                        <h3 className="font-semibold mb-2 text-white flex items-center gap-2">
                            <span>☁️</span> Cloud Persistence
                        </h3>
                        <p className="text-xs text-gray-400">
                            Data is stored in MindCache Cloud. Other clients will see updates after you save.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
