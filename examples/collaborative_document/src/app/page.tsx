'use client';

import { useState, useEffect, useCallback } from 'react';
import { MindCache } from 'mindcache';

// Simulate two users/editors with their own MindCache instances
// In real app, these would be on different browsers/devices
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
    const [isConnected, setIsConnected] = useState(true);
    const [isOffline, setIsOffline] = useState(false);

    // Subscribe to document changes
    useEffect(() => {
        if (!mc) return;

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
        if (!mc) return;
        mc.replace_document_text('shared_doc', newText);
        setText(newText);
    }, [mc]);

    const toggleOffline = useCallback(() => {
        if (!mc) return;
        if (isOffline) {
            // Can't easily reconnect in current API - would need to recreate instance
            // For demo purposes, just toggle the visual
            setIsOffline(false);
            setIsConnected(true);
        } else {
            mc.disconnect();
            setIsOffline(true);
            setIsConnected(false);
        }
    }, [mc, isOffline]);

    const statusColor = isConnected ? 'bg-green-500' : 'bg-red-500';
    const statusText = isConnected ? 'Online' : 'Offline';

    return (
        <div className={`flex-1 p-4 rounded-lg border-2 ${color}`}>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Editor {id}</h2>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${statusColor} animate-pulse`} />
                        <span className="text-sm text-gray-400">{statusText}</span>
                    </div>
                    <button
                        onClick={toggleOffline}
                        disabled={isOffline}
                        className={`px-3 py-1 text-sm rounded ${isOffline
                                ? 'bg-gray-600 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                    >
                        {isOffline ? 'Offline (refresh to reconnect)' : 'Go Offline'}
                    </button>
                </div>
            </div>

            <textarea
                value={text}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Start typing... changes sync in real-time!"
                className="w-full h-64 p-4 bg-gray-800 border border-gray-600 rounded-lg resize-none focus:outline-none focus:border-blue-500 font-mono"
            />

            <div className="mt-2 text-xs text-gray-500">
                {text.length} characters
            </div>
        </div>
    );
}

export default function Home() {
    const [mc1, setMc1] = useState<MindCache | null>(null);
    const [mc2, setMc2] = useState<MindCache | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mode, setMode] = useState<'local' | 'cloud'>('local');
    const [instanceId, setInstanceId] = useState('');

    useEffect(() => {
        const init = async () => {
            if (mode === 'local') {
                // Local mode: Two instances sharing same Yjs doc via shared name
                // This simulates collaboration within same browser (for demo)
                const cache1 = new MindCache({
                    indexedDB: { dbName: 'collab-demo-1' }
                });
                const cache2 = new MindCache({
                    indexedDB: { dbName: 'collab-demo-2' }
                });

                await cache1.waitForSync();
                await cache2.waitForSync();

                // Initialize document if not exists
                if (!cache1.get_document('shared_doc')) {
                    cache1.set_document('shared_doc', '# Welcome to MindCache Collaborative Demo!\n\nType in either editor and watch changes appear in real-time.\n\nFeatures:\n- Character-level CRDT sync\n- Diff-based updates\n- Offline support (click "Go Offline")\n');
                }
                if (!cache2.get_document('shared_doc')) {
                    cache2.set_document('shared_doc', cache1.get_document_text('shared_doc') || '');
                }

                setMc1(cache1);
                setMc2(cache2);
            } else {
                // Cloud mode would go here (requires instanceId)
                // const { MindCache } = await import('mindcache/cloud');
                // ...
            }
            setIsLoading(false);
        };

        init();

        return () => {
            mc1?.disconnect();
            mc2?.disconnect();
        };
    }, [mode, instanceId]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-xl">Loading MindCache instances...</div>
            </div>
        );
    }

    return (
        <main className="p-8">
            <div className="max-w-6xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold mb-2">
                        MindCache Collaborative Document
                    </h1>
                    <p className="text-gray-400">
                        Real-time document sync with Y.Text CRDT
                    </p>
                    <div className="mt-4 text-sm text-gray-500">
                        Mode: <span className="text-blue-400">{mode === 'local' ? 'Local (IndexedDB)' : 'Cloud'}</span>
                        {mode === 'local' && (
                            <span className="ml-2">(Note: Local mode simulates two editors, but they don&apos;t truly sync - use Cloud mode for real sync)</span>
                        )}
                    </div>
                </header>

                <div className="flex gap-6">
                    <DocumentEditor
                        id="A"
                        mc={mc1}
                        color="border-blue-500/50"
                    />
                    <DocumentEditor
                        id="B"
                        mc={mc2}
                        color="border-purple-500/50"
                    />
                </div>

                <div className="mt-8 p-6 bg-gray-800 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">How it works</h3>
                    <ul className="list-disc list-inside space-y-2 text-gray-300">
                        <li>Each editor has its own <code className="text-green-400">MindCache</code> instance</li>
                        <li>Documents use <code className="text-green-400">Y.Text</code> CRDT for conflict-free merging</li>
                        <li>Changes are diff-based (small edits don&apos;t replace entire document)</li>
                        <li>Click &quot;Go Offline&quot; to simulate network disconnection</li>
                        <li>Offline changes queue locally and sync when reconnected</li>
                    </ul>
                </div>

                <div className="mt-6 p-6 bg-gray-800 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">For true real-time sync:</h3>
                    <pre className="text-sm text-gray-300 overflow-x-auto">
                        {`import { MindCache } from 'mindcache/cloud';

const mc = new MindCache({
  cloud: {
    instanceId: 'your-instance-id',
    tokenEndpoint: '/api/ws-token'
  }
});

await mc.waitForSync();
mc.set_document('notes', '# Hello World');`}
                    </pre>
                </div>
            </div>
        </main>
    );
}
