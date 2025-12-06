'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';

export default function ImageExample() {
  const { getInstanceId } = useInstances();
  const instanceId = getInstanceId('image');
  
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [stmLoaded, setStmLoaded] = useState(false);

  useEffect(() => {
    if (!instanceId) return;

    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const rawUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL || '';
    const baseUrl = rawUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    if (!mindcacheRef.current.has('user_image')) {
      mindcacheRef.current.set_value('user_image', '', { 
        visible: false, readonly: true, type: 'image', contentType: 'image/jpeg'
      });
    }

    if (apiKey) {
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId: 'cloud-demo',
        baseUrl,
      });

      adapter.on('connected', () => setConnectionState('connected'));
      adapter.on('disconnected', () => setConnectionState('disconnected'));
      adapter.on('error', () => setConnectionState('error'));
      adapter.on('synced', () => {
        setStmLoaded(true);
        setImageUrl(mindcacheRef.current.get_data_url('user_image'));
        setStmVersion(v => v + 1);
      });

      adapter.attach(mindcacheRef.current);
      cloudAdapterRef.current = adapter;
      adapter.connect();
      setConnectionState('connecting');
    } else {
      setStmLoaded(true);
    }

    const handleChange = () => setImageUrl(mindcacheRef.current.get_data_url('user_image'));
    mindcacheRef.current.subscribeToAll(handleChange);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(handleChange);
      cloudAdapterRef.current?.disconnect();
      cloudAdapterRef.current?.detach();
    };
  }, [instanceId]);

  const handleImageUpload = async (file: File) => {
    try {
      await mindcacheRef.current.set_file('user_image', file, { visible: true, readonly: false });
      setStmVersion(v => v + 1);
    } catch (error) {
      alert('Failed to upload image');
    }
  };

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (!instanceId) {
    return (
      <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex items-center justify-center">
        <div className="text-yellow-400">Waiting for instance...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex gap-1">
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-cyan-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to analyze or generate images.</div>
        </div>
        <ChatInterface
          instanceId={instanceId}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Image Display</div>
            <div className="text-gray-400 text-sm">Instance: {instanceId.slice(0, 8)}...</div>
          </div>
          <span className={`${getStatusColor()} text-lg`}>{getStatusIcon()}</span>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 flex flex-col">
          <div className="flex-1 flex items-center justify-center min-h-0">
            {imageUrl ? (
              <img src={imageUrl} alt="User uploaded" className="max-w-full max-h-full object-contain border border-gray-600 rounded" />
            ) : (
              <div className="text-gray-500 text-center">
                <div className="mb-4">No image uploaded yet</div>
                <div className="text-sm">Click below to upload</div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-600">
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleImageUpload(file);
                };
                input.click();
              }}
              className="w-full bg-black border border-gray-600 text-cyan-400 font-mono text-sm px-4 py-2 rounded hover:border-gray-400 transition-colors"
            >
              Upload Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
