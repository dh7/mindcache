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

export default function AdminPage() {
  const [namespaces, setNamespaces] = useState<DONamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
                        <tr key={obj.id} className="hover:bg-zinc-800/30 transition">
                          <td className="p-3 font-mono text-xs text-gray-300 break-all">
                            {obj.id}
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
    </main>
  );
}

