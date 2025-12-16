'use client';

import { useEffect, useState } from 'react';
import { useMindCache } from 'mindcache';
import ChatInterface from './ChatInterface';
import type { TypedToolCall, ToolSet } from 'ai';

export default function ImageExample() {
  // Use the hook - handles all async init and cleanup automatically
  const { mindcache, isLoaded } = useMindCache({
    indexedDB: {
      dbName: 'image_example_db',
      storeName: 'image_store',
      debounceMs: 500
    }
  });

  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [keysInitialized, setKeysInitialized] = useState(false);

  // Initialize STM with image field
  useEffect(() => {
    if (!isLoaded || !mindcache) return;

    // Create STM key if it doesn't exist
    if (!mindcache.has('user_image')) {
      mindcache.set_value('user_image', '', {
        visible: false,
        readonly: true,
        type: 'image',
        contentType: 'image/jpeg'
      });
    }

    // Load initial image from STM
    const dataUrl = mindcache.get_data_url('user_image');
    setImageUrl(dataUrl);

    // Subscribe to STM changes
    const handleSTMChange = () => {
      const dataUrl = mindcache.get_data_url('user_image');
      setImageUrl(dataUrl);
    };

    mindcache.subscribeToAll(handleSTMChange);
    setKeysInitialized(true);

    return () => {
      mindcache.unsubscribeFromAll(handleSTMChange);
    };
  }, [isLoaded, mindcache]);

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    if (!mindcache) return;
    try {
      await mindcache.set_file('user_image', file, {
        visible: true,
        readonly: false
      });
      setStmVersion(v => v + 1);
      console.log('✅ Image uploaded to STM');
    } catch (error) {
      console.error('❌ Failed to upload image:', error);
      alert('Failed to upload image. Please try again.');
    }
  };

  // Handle tool calls
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
            text: 'Hello! I can see and analyze the image you upload. Try uploading an image or ask me to describe it. I can also generate new images.'
          }
        ],
        createdAt: new Date()
      }
    ];
  };

  // Show loading state
  if (!isLoaded || !mindcache || !keysInitialized) {
    return (
      <div className="h-screen bg-black text-green-400 font-mono p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-green-400 font-mono p-6 flex gap-1">
      {/* Left Panel - Chat */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-green-400 mb-2">Chat Assistant</div>
          <div className="text-gray-400 text-sm">Ask me to analyze the image.</div>
        </div>

        <ChatInterface
          onToolCall={handleToolCall}
          initialMessages={getInitialMessages()}
          stmLoaded={keysInitialized}
          stmVersion={stmVersion}
          systemPrompt={`You are a helpful assistant that can work with images stored in short-term memory (STM).
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
          mindcacheInstance={mindcache}
        />
      </div>

      {/* Right Panel - Image */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4">
          <div className="text-green-400 mb-2">Image Display</div>
          <div className="text-gray-400 text-sm">Image stored in mindCache</div>
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
              className="w-full bg-black border border-gray-600 text-green-400 font-mono text-sm px-4 py-2 rounded hover:border-gray-400 transition-colors"
            >
              Upload Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
