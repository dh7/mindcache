'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';

export default function ImageExample() {
  const { getInstanceId, error: instanceError } = useInstances();
  const instanceId = getInstanceId('image');

  // Create MindCache with cloud config - same simplicity as local!
  const mindcacheRef = useRef<MindCache | null>(null);
  if (!mindcacheRef.current && instanceId) {
    mindcacheRef.current = new MindCache({
      cloud: {
        instanceId,
        tokenEndpoint: '/api/ws-token',
        baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL,
      }
    });
  }

  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');

  // Subscribe to STM changes
  useEffect(() => {
    const mc = mindcacheRef.current;
    if (!mc) return;

    const handleChange = () => {
      setIsLoaded(mc.isLoaded);
      setConnectionState(mc.connectionState);
      
      if (mc.isLoaded) {
        // Initialize user_image key if it doesn't exist
        if (!mc.has('user_image')) {
          mc.set_value('user_image', '', { 
            visible: false, readonly: true, type: 'image', contentType: 'image/jpeg'
          });
        }
        setImageUrl(mc.get_data_url('user_image'));
      }
      
      setStmVersion(v => v + 1);
    };

    handleChange();
    mc.subscribeToAll(handleChange);
    return () => mc.unsubscribeFromAll(handleChange);
  }, [instanceId]);

  const handleImageUpload = async (file: File) => {
    try {
      await mindcacheRef.current?.set_file('user_image', file, { visible: true, readonly: false });
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
        <div className="max-w-lg text-center space-y-4">
          <div className="text-yellow-400 text-lg">⚠️ Instance Not Configured</div>
          <p className="text-gray-400 text-sm">
            {instanceError || 'Image instance ID not set.'}
          </p>
          <div className="text-left bg-gray-900 p-4 rounded-lg border border-gray-700">
            <p className="text-gray-500 text-xs mb-2">Add to .env.local:</p>
            <code className="text-green-400 text-sm">
              NEXT_PUBLIC_INSTANCE_IMAGE=your-instance-id
            </code>
          </div>
          <p className="text-gray-500 text-xs">
            Get instance IDs from the MindCache web UI (localhost:3003)
          </p>
        </div>
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
          stmLoaded={isLoaded}
          stmVersion={stmVersion}
          mindcacheInstance={mindcacheRef.current!}
        />
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Image Display</div>
            <div className="text-gray-400 text-sm font-mono">{instanceId.slice(0, 8)}...</div>
          </div>
          <span className={`${getStatusColor()} text-lg`} title={connectionState}>{getStatusIcon()}</span>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 flex flex-col">
          {!isLoaded ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Loading... ({connectionState})
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
