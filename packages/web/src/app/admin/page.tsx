'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DOObject {
  id: string;
  hasStoredData: boolean;
}

interface DONamespace {
  id: string;
  name: string;
  class: string;
  script: string;
  objects: DOObject[];
  objectCount: number;
}

interface KeyEntry {
  value: unknown;
  attributes: {
    type: string;
    readonly?: boolean;
    visible?: boolean;
    tags?: string[];
  };
  updatedAt: number;
}

export default function AdminPage() {
  const [namespaces, setNamespaces] = useState<DONamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [objectData, setObjectData] = useState<Record<string, KeyEntry> | null>(null);
  const [objectLoading, setObjectLoading] = useState(false);
  const [objectError, setObjectError] = useState<string | null>(null);

  useEffect(() => {
    fetchDurableObjects();
  }, []);

  async function fetchDurableObjects() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/durable-objects');
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to fetch');
        return;
      }
      
      setNamespaces(data.namespaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchObjectData(objectId: string) {
    setSelectedObject(objectId);
    setObjectLoading(true);
    setObjectError(null);
    setObjectData(null);
    
    try {
      const res = await fetch(`/api/admin/durable-objects/${objectId}`);
      const data = await res.json();
      
      if (!res.ok) {
        setObjectError(data.error + (data.details ? `\n\n${data.details}` : ''));
        return;
      }
      
      setObjectData(data.keys);
    } catch (err) {
      setObjectError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setObjectLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 bg-[#0a0a0a]">
      <nav className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-white">Admin: Durable Objects</h1>
        </div>
        <button
          onClick={fetchDurableObjects}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition text-sm"
        >
          Refresh
        </button>
      </nav>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && namespaces.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          No Durable Object namespaces found
        </div>
      )}

      {!loading && !error && namespaces.length > 0 && (
        <div className="space-y-6">
          {namespaces.map((ns) => (
            <div
              key={ns.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{ns.class}</h2>
                    <p className="text-sm text-gray-500">Script: {ns.script}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-400">
                      {ns.objectCount}
                    </div>
                    <div className="text-xs text-gray-500">objects</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600 font-mono break-all">
                  NS: {ns.id}
                </div>
              </div>

              {ns.objects.length > 0 && (
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-medium">Object ID</th>
                        <th className="text-center p-3 text-gray-400 font-medium w-32">Has Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {ns.objects.map((obj) => (
                        <tr 
                          key={obj.id} 
                          className="hover:bg-zinc-800/30 transition cursor-pointer"
                          onClick={() => fetchObjectData(obj.id)}
                        >
                          <td className="p-3 font-mono text-xs text-gray-300 break-all">
                            {obj.id}
                            {selectedObject === obj.id && (
                              <span className="ml-2 text-emerald-400">●</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {obj.hasStoredData ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400">
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-500/10 text-zinc-400">
                                No
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {ns.objects.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No objects in this namespace
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Object Detail Modal */}
      {selectedObject && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedObject(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Object Contents</h3>
                <p className="text-xs text-gray-500 font-mono mt-1">{selectedObject}</p>
              </div>
              <button
                onClick={() => setSelectedObject(null)}
                className="text-gray-400 hover:text-white p-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {objectLoading && (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                </div>
              )}

              {objectError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm whitespace-pre-wrap">
                  {objectError}
                </div>
              )}

              {!objectLoading && !objectError && objectData && (
                <div className="space-y-3">
                  {Object.keys(objectData).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No keys stored</p>
                  ) : (
                    Object.entries(objectData).map(([key, entry]) => (
                      <div 
                        key={key}
                        className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-sm text-emerald-400">{key}</span>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-0.5 bg-zinc-700 rounded">{entry.attributes.type}</span>
                            {entry.attributes.readonly && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">readonly</span>
                            )}
                            {entry.attributes.tags?.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <pre className="text-xs text-gray-300 bg-zinc-900 p-2 rounded overflow-x-auto max-h-40">
                          {typeof entry.value === 'string' 
                            ? entry.value 
                            : JSON.stringify(entry.value, null, 2)}
                        </pre>
                        <div className="text-xs text-gray-600 mt-2">
                          Updated: {new Date(entry.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

