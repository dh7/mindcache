'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { mindcache } from 'mindcache';
import ChatInterface from './ChatInterface';
import STMEditor from './STMEditor';
import Workflows from './Workflows';

// Import official types from AI SDK
import type { TypedToolCall, ToolSet } from 'ai';

export default function ClientSTMDemo() {
  const mindcacheRef = useRef(mindcache);
  const [leftWidth, setLeftWidth] = useState(70); // Percentage width for left panel
  const [isResizing, setIsResizing] = useState(false);
  
  // Workflow state
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');


  // Analyze image tool function
  const analyzeImageWithSTM = async (prompt: string, keyName?: string) => {
    try {
      console.log('🔍 Starting image analysis with STM integration');
      
      // Extract image references from prompt (@image_name, {image_name}, etc.)
      const imageRefMatches = prompt.match(/@(\w+)|{(\w+)}/g);
      const imageRefs = imageRefMatches?.map(ref => ref.replace(/[@{}]/g, '')) || [];
      
      console.log('📝 Found image references:', imageRefs);
      
      // Only analyze images with explicit references
      let imagesToAnalyze: string[] = [];
      if (imageRefs.length === 0) {
        // NO EXPLICIT REFERENCES: Don't attach any images
        console.log('🚫 No explicit image references found - no images will be analyzed');
        return {
          success: false,
          error: 'No explicit image references found. Please use @image_name syntax to specify which image to analyze (e.g., "Analyze @my_image and describe what you see").'
        };
      } else {
        // EXPLICIT REFERENCES: Get specific referenced images (ignore visibility)
        console.log('🎯 Using explicit image references:', imageRefs);
        imageRefs.forEach(ref => {
          const base64Data = mindcacheRef.current.get_base64(ref);
          if (base64Data) {
            imagesToAnalyze.push(base64Data);
            console.log(`✅ Found referenced image: ${ref}`);
          } else {
            console.warn(`❌ Referenced image not found: ${ref}`);
          }
        });
      }
      
      if (imagesToAnalyze.length === 0) {
        return {
          success: false,
          error: 'No images found to analyze. Make sure images are stored in STM and referenced correctly.'
        };
      }
      
      // Create FormData for the analysis API
      const formData = new FormData();
      
      // Convert first base64 to blob for the API (for now, analyze first image)
      const base64Data = imagesToAnalyze[0];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      formData.append('image', blob, 'image.jpg');
      formData.append('prompt', prompt);
      
      console.log('🚀 Calling image analysis API');
      const response = await fetch('/api/image-analysis', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          // Store analysis result in STM
          const timestamp = Date.now();
          const analysisKey = keyName || `image_analysis_${timestamp}`;
          
          console.log('💾 Storing analysis in STM:', { analysisKey, analysis: result.data.analysis });
          mindcacheRef.current.set_value(analysisKey, result.data.analysis, {
            type: 'text',
            visible: true
          });
          
          return {
            success: true,
            analysisKey,
            analysis: result.data.analysis,
            confidence: result.data.confidence,
            tags: result.data.tags,
            summary: result.data.summary,
            message: `Image analysis completed and stored as '${analysisKey}'`
          };
        } else {
          return {
            success: false,
            error: result.error || 'Analysis failed'
          };
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: errorData.error || `API error: ${response.status}`
        };
      }
    } catch (error) {
      console.error('❌ Image analysis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  };

  // Generate image tool function with pre-resolved images
  const generateImageWithImages = async (prompt: string, images: string[] = [], imageName?: string) => {
    try {
      // Auto-detect mode based on whether images are provided
      const mode = images.length > 0 ? 'edit' : 'generate';
      
      console.log('🔍 generateImageWithImages called with:', { prompt, mode, imageCount: images.length, imageName });
      
      // Use provided images instead of parsing prompt
      const cleanPrompt = prompt; // Don't modify the prompt since images are provided separately
      
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

      console.log('📤 Sending request:', { 
        mode, 
        hasImages: images.length > 0, 
        imageCount: images.length,
        promptLength: cleanPrompt.length 
      });

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
          const imageKey = imageName || `generated_image_${timestamp}`;
          
          console.log('🖼️ Adding image to mindcache:', { imageKey, contentType, base64Length: base64Data.length, customName: !!imageName });
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
        error: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };
  
  // Define initial assistant message using tagged content
  const getInitialMessages = () => {
    const assistantFirstMessage = mindcacheRef.current.getTagged("AssistantFirstMessage");
    const messageText = assistantFirstMessage 
      ? assistantFirstMessage.split(': ').slice(1).join(': ') // Extract value part after "key: "
      : 'Hello!';
    
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: messageText
          }
        ],
        createdAt: new Date()
      }
    ];
  };
  
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
      const { prompt, imageName } = toolCall.input as { prompt: string; imageName?: string };
      
      // Extract explicit image references from prompt (@image_name, {image_name}, etc.)
      const imageRefMatches = prompt.match(/@(\w+)|{(\w+)}/g);
      const explicitImageRefs = imageRefMatches?.map(ref => ref.replace(/[@{}]/g, '')) || [];
      
      console.log('📝 Found explicit image references:', explicitImageRefs);
      
      let imagesToInclude: string[] = [];
      
      if (explicitImageRefs.length > 0) {
        // EXPLICIT REFERENCES: Get specific referenced images (ignore visibility)
        console.log('🎯 Using explicit image references:', explicitImageRefs);
        explicitImageRefs.forEach(ref => {
          const base64Data = mindcacheRef.current.get_base64(ref);
          if (base64Data) {
            imagesToInclude.push(base64Data);
            console.log(`✅ Found referenced image: ${ref}`);
          } else {
            console.warn(`❌ Referenced image not found: ${ref}`);
          }
        });
      } else {
        // NO EXPLICIT REFERENCES: Don't include any images (generate new image)
        console.log('🚫 No explicit image references - will generate new image without input images');
      }
      
      console.log(`🎯 Images to include: ${imagesToInclude.length} (explicitRefs: ${explicitImageRefs.length})`);
      
      const result = await generateImageWithImages(prompt, imagesToInclude, imageName);
      console.log('🖼️ Image generation result:', result);
      return result;
    }

    // Handle analyze_image tool calls
    if (toolCall.toolName === 'analyze_image') {
      const { prompt, analysisName } = toolCall.input as { prompt: string; analysisName?: string };
      
      console.log('🔍 Analyzing image with prompt:', prompt);
      
      const result = await analyzeImageWithSTM(prompt, analysisName);
      console.log('🔍 Image analysis result:', result);
      return result;
    }
  };

  // Workflow handlers
  const handleSendPrompt = (prompt: string) => {
    setWorkflowPrompt(prompt);
  };

  const handleWorkflowPromptSent = () => {
    setWorkflowPrompt(''); // Clear the prompt after sending
  };

  const handleExecutionComplete = () => {
    // Workflow execution complete
  };

  const handleStatusChange = (status: string) => {
    setChatStatus(status);
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
      {/* Left Panel - ChatInterface with Workflows in between */}
      <div 
        style={{ width: `${leftWidth}%` }}
        className="flex flex-col min-h-0"
      >
        <ChatInterface 
          onToolCall={handleToolCall} 
          initialMessages={getInitialMessages()}
          workflowPrompt={workflowPrompt}
          onWorkflowPromptSent={handleWorkflowPromptSent}
          onStatusChange={handleStatusChange}
        >
          <Workflows 
            onSendPrompt={handleSendPrompt}
            isExecuting={chatStatus !== 'ready'}
            onExecutionComplete={handleExecutionComplete}
          />
        </ChatInterface>
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
