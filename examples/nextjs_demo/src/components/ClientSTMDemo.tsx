'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { mindcache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  const [leftWidth, setLeftWidth] = useState(70); // Percentage width for left panel
  const [isResizing, setIsResizing] = useState(false);

  // Function to parse image references from prompt
  const parseImageReferences = (prompt: string): { images: string[], cleanPrompt: string } => {
    const imageRefs: string[] = [];
    let cleanPrompt = prompt;

    // Match @images_X or {image_X} patterns
    const patterns = [/@images?_(\w+)/g, /\{images?_(\w+)\}/g];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        const imageKey = `images_${match[1]}`;
        const base64Data = mindcacheRef.current.get_base64(imageKey);
        if (base64Data) {
          imageRefs.push(base64Data);
          // Remove the reference from the prompt
          cleanPrompt = cleanPrompt.replace(match[0], '').trim();
        }
      }
    });

    return { images: imageRefs, cleanPrompt };
  };

  // Generate image tool function
  const generateImage = async (prompt: string, mode: 'edit' | 'generate' = 'generate') => {
    try {
      const { images, cleanPrompt } = parseImageReferences(prompt);
      
      const requestBody: any = {
        prompt: cleanPrompt,
        mode,
        seed: -1,
      };

      if (mode === 'edit' && images.length > 0) {
        if (images.length === 1) {
          requestBody.imageBase64 = images[0];
        } else {
          requestBody.images = images;
        }
        requestBody.promptUpsampling = false;
        requestBody.safetyTolerance = 2;
      } else if (mode === 'generate') {
        requestBody.aspectRatio = "1:1";
      }

      const response = await fetch('/api/image-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        // Check if response is an image (binary data)
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.startsWith('image/')) {
          // Handle binary image response
          const imageBlob = await response.blob();
          const requestId = response.headers.get('X-Request-ID');
          const responseMode = response.headers.get('X-Mode');
          const inputCount = parseInt(response.headers.get('X-Input-Count') || '0');
          
          // Convert blob to base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
          });
          
          // Store the generated image in mindcache
          const timestamp = Date.now();
          const imageKey = `generated_image_${timestamp}`;
          
          console.log('🖼️ Adding image to mindcache:', { imageKey, contentType, base64Length: base64Data.length });
          mindcacheRef.current.add_image(imageKey, base64Data, contentType);
          
          // Debug: Check what was actually stored
          const storedAttributes = mindcacheRef.current.get_attributes(imageKey);
          console.log('🔍 Stored attributes:', storedAttributes);

          return {
            success: true,
            imageKey,
            mode: responseMode || mode,
            inputCount,
            requestId,
            message: `Image ${mode === 'edit' ? 'edited' : 'generated'} successfully and stored as '${imageKey}'`
          };
        } else {
          // Handle JSON error response
          const result = await response.json();
          return {
            success: false,
            error: result.error || 'Unknown error occurred'
          };
        }
      } else {
        // Handle HTTP error
        try {
          const result = await response.json();
          return {
            success: false,
            error: result.error || `HTTP ${response.status}: ${response.statusText}`
          };
        } catch {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to ${mode} image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
  
  // Define initial assistant message
  const initialMessages = [
    {
      id: 'welcome-message',
      role: 'assistant' as const,
      parts: [
        {
          type: 'text' as const,
          text: 'Hello! I\'m your AI assistant with access to your short-term memory. I can help you manage your preferences, notes, and other information. What would you like to do today?'
        }
      ],
      createdAt: new Date()
    }
  ];
  
  // Initialize with auto-load and default keys
  useEffect(() => {
    // Try to load from localStorage first
    const saved = localStorage.getItem('mindcache_stm');
    if (saved) {
      try {
        mindcacheRef.current.fromJSON(saved);
        console.log('✅ Auto-loaded STM from localStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to auto-load STM:', error);
      }
    }

    // If no saved data, create default keys
    const currentKeys = Object.keys(mindcacheRef.current.getAll());
    const userKeys = currentKeys.filter(key => !key.startsWith('$'));
    
    if (userKeys.length === 0) {
      console.log('Creating default STM keys...');
      mindcacheRef.current.set_value('name', 'Anonymous User', { default: 'Anonymous User' });
      mindcacheRef.current.set_value('preferences', 'No preferences set', { default: 'No preferences set' });
      mindcacheRef.current.set_value('notes', 'No notes', { default: 'No notes' });
      console.log('Created keys:', Object.keys(mindcacheRef.current.getAll()));
    }
  }, []);

  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
    
    // Handle generate_image tool calls
    if (toolCall.toolName === 'generate_image') {
      const { prompt, mode } = toolCall.input as { prompt: string; mode?: 'edit' | 'generate' };
      const result = await generateImage(prompt, mode);
      console.log('🖼️ Image generation result:', result);
      return result;
    }
  };

  // Handle mouse events for resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) {
      return;
    }
    
    const containerRect = document.querySelector('.resize-container')?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }
    
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    // Constrain between 20% and 80%
    const constrainedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
    setLeftWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-screen bg-black text-green-400 font-mono p-6 flex overflow-hidden resize-container">
      {/* Left Panel - ChatInterface */}
      <div 
        style={{ width: `${leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <ChatInterface onToolCall={handleToolCall} initialMessages={initialMessages} />
      </div>
      
      {/* Resizer - invisible but functional */}
      <div
        className={`w-1 bg-transparent hover:bg-green-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${
          isResizing ? 'bg-green-400 bg-opacity-50' : ''
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      />
      
      {/* Right Panel - STMEditor */}
      <div 
        style={{ width: `${100 - leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <STMEditor />
      </div>
    </div>
  );
}
