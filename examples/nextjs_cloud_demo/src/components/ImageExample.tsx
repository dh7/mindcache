'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import ChatInterface from './ChatInterface';
import type { TypedToolCall, ToolSet } from 'ai';

export default function ImageExample() {
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [stmLoaded, setStmLoaded] = useState(false);

  // Initialize STM with image field and cloud connection
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const instanceId = process.env.NEXT_PUBLIC_MINDCACHE_INSTANCE_ID;
    const projectId = process.env.NEXT_PUBLIC_MINDCACHE_PROJECT_ID;

    // Create STM key if it doesn't exist
    if (!mindcacheRef.current.has('user_image')) {
      mindcacheRef.current.set_value('user_image', '', { 
        visible: false, 
        readonly: true,
        type: 'image',
        contentType: 'image/jpeg'
      });
    }

    // Initialize CloudAdapter if credentials are available
    if (apiKey && instanceId && projectId) {
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId,
      });

      adapter.on('connected', () => {
        console.log('☁️ Image connected to cloud');
        setConnectionState('connected');
      });

      adapter.on('disconnected', () => {
        setConnectionState('disconnected');
      });

      adapter.on('error', (error) => {
        console.error('☁️ Cloud error:', error);
        setConnectionState('error');
      });

      adapter.on('synced', () => {
        console.log('☁️ Image synced');
        setStmLoaded(true);
        const dataUrl = mindcacheRef.current.get_data_url('user_image');
        setImageUrl(dataUrl);
        setStmVersion(v => v + 1);
      });

      adapter.attach(mindcacheRef.current);
      cloudAdapterRef.current = adapter;
      adapter.connect();
      setConnectionState('connecting');
    } else {
      setStmLoaded(true);
    }

    // Load initial image from STM
    const dataUrl = mindcacheRef.current.get_data_url('user_image');
    setImageUrl(dataUrl);

    // Subscribe to STM changes
    const handleSTMChange = () => {
      const dataUrl = mindcacheRef.current.get_data_url('user_image');
      setImageUrl(dataUrl);
    };

    mindcacheRef.current.subscribeToAll(handleSTMChange);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(handleSTMChange);
      if (cloudAdapterRef.current) {
        cloudAdapterRef.current.disconnect();
        cloudAdapterRef.current.detach();
      }
    };
  }, []);

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    try {
      await mindcacheRef.current.set_file('user_image', file, {
        visible: true,
        readonly: false
      });
      setStmVersion(v => v + 1);
      console.log('✅ Image uploaded to cloud STM');
    } catch (error) {
      console.error('❌ Failed to upload image:', error);
      alert('Failed to upload image. Please try again.');
    }
  };

  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
  };

  const getInitialMessages = () => {
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: 'Hello! I can see and analyze the image you upload. Try uploading an image or ask me to describe it. I can also generate new images. Your images sync to the cloud!'
          }
        ],
        createdAt: new Date()
      }
    ];
  };

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionState) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'error': return '✕';
      default: return '○';
    }
  };

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 flex gap-1">
      {/* Left Panel - Chat */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-cyan-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to analyze the image.</div>
        </div>

        <ChatInterface
          onToolCall={handleToolCall}
          initialMessages={getInitialMessages()}
          stmLoaded={stmLoaded}
          stmVersion={stmVersion}
          systemPrompt={`You are a helpful assistant that can work with images stored in cloud-synced short-term memory (STM).
The current image is stored as 'user_image' in STM.

IMAGE ANALYSIS:
- To analyze the current image, use: analyze_image({ prompt: "Analyze {{user_image}} and describe..." })
- Always include {{user_image}} with double curly braces in the analyze prompt

IMAGE EDITING (VERY IMPORTANT):
- To edit/modify the existing image, use: generate_image({ prompt: "Edit {{user_image}} to [changes]", imageName: "user_image" })
- The prompt MUST start with "Edit {{user_image}} to..." or "Modify {{user_image}} to..."
- The {{user_image}} placeholder tells the system to use the existing image as input for editing
- Examples:
  * generate_image({ prompt: "Edit {{user_image}} to make the eyes blue", imageName: "user_image" })
  * generate_image({ prompt: "Modify {{user_image}} to add a hat", imageName: "user_image" })

IMAGE GENERATION (NEW IMAGE):
- To create a completely new image, use: generate_image({ prompt: "a description", imageName: "user_image" })
- Do NOT include {{user_image}} when generating from scratch
- Example: generate_image({ prompt: "a cat sitting on a windowsill", imageName: "user_image" })

REMEMBER: Always set imageName to "user_image" so changes are visible to the user!`}
          mindcacheInstance={mindcacheRef.current}
        />
      </div>

      {/* Right Panel - Image */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Image Display</div>
            <div className="text-gray-400 text-sm">Image synced to cloud</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`${getConnectionStatusColor()} text-lg`}>
              {getConnectionStatusIcon()}
            </span>
            <span className={`${getConnectionStatusColor()} text-xs`}>
              {connectionState === 'connected' ? 'Cloud' : connectionState}
            </span>
          </div>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 flex flex-col">
          {/* Image Display */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            {imageUrl ? (
              <img 
                src={imageUrl} 
                alt="User uploaded" 
                className="max-w-full max-h-full object-contain border border-gray-600 rounded"
              />
            ) : (
              <div className="text-gray-500 text-center">
                <div className="mb-4">No image uploaded yet</div>
                <div className="text-sm">Click below to upload an image</div>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="mt-4 pt-4 border-t border-gray-600">
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    handleImageUpload(file);
                  }
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

