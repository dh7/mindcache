'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import ChatInterface from './ChatInterface';
import Workflows from './Workflows';
import type { TypedToolCall, ToolSet } from 'ai';

const WORKFLOW_STEPS = `1. Search about {{topic}} and write a comprehensive summary into content_summary
2. Search about {{company}} and write a company summary into company_summary
3. Write a tweet about {{topic}} that will appeal to {{audience}} on behalf of {{company}}. Store it in tweet. Content summary: {{content_summary}}. Company summary: {{company_summary}}
4. Generate an image for the tweet that matches {{audience}} and {{company}} brand. Store it as tweet_image. Tweet text: {{tweet}}. Audience: {{audience}}. Company summary: {{company_summary}}`;

export default function TweetWorkflowExample() {
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [formData, setFormData] = useState({
    topic: '',
    company: '',
    audience: ''
  });
  const [contentSummary, setContentSummary] = useState('');
  const [companySummary, setCompanySummary] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [tweetImage, setTweetImage] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [stmLoaded, setStmLoaded] = useState(false);
  
  // Workflow state
  const [workflowPrompt, setWorkflowPrompt] = useState<string>('');
  const [chatStatus, setChatStatus] = useState<string>('ready');

  // Initialize STM with all fields
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const instanceId = process.env.NEXT_PUBLIC_MINDCACHE_INSTANCE_ID;
    const projectId = process.env.NEXT_PUBLIC_MINDCACHE_PROJECT_ID;

    const fields = [
      { key: 'topic', value: '', visible: true, readonly: false },
      { key: 'company', value: '', visible: true, readonly: false },
      { key: 'audience', value: '', visible: true, readonly: false },
      { key: 'content_summary', value: '', visible: true, readonly: false },
      { key: 'company_summary', value: '', visible: true, readonly: false },
      { key: 'tweet', value: '', visible: true, readonly: false },
      { key: 'tweet_image', value: '', visible: false, readonly: true, type: 'image', contentType: 'image/jpeg' }
    ];

    fields.forEach(({ key, value, visible, readonly, type, contentType }) => {
      if (!mindcacheRef.current.has(key)) {
        mindcacheRef.current.set_value(key, value, { visible, readonly, type: type as any, contentType });
      }
    });

    // Initialize CloudAdapter if credentials are available
    if (apiKey && instanceId && projectId) {
      const adapter = new CloudAdapter({
        apiKey,
        instanceId,
        projectId,
      });

      adapter.on('connected', () => {
        console.log('☁️ Workflow connected to cloud');
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
        console.log('☁️ Workflow synced');
        setStmLoaded(true);
        loadFormData();
        setStmVersion(v => v + 1);
      });

      adapter.attach(mindcacheRef.current);
      cloudAdapterRef.current = adapter;
      adapter.connect();
      setConnectionState('connecting');
    } else {
      setStmLoaded(true);
    }

    // Load initial values from STM
    loadFormData();

    // Subscribe to STM changes
    const handleSTMChange = () => {
      loadFormData();
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

  const loadFormData = () => {
    setFormData({
      topic: mindcacheRef.current.get_value('topic') || '',
      company: mindcacheRef.current.get_value('company') || '',
      audience: mindcacheRef.current.get_value('audience') || ''
    });
    setContentSummary(mindcacheRef.current.get_value('content_summary') || '');
    setCompanySummary(mindcacheRef.current.get_value('company_summary') || '');
    setTweetText(mindcacheRef.current.get_value('tweet') || '');
    
    const dataUrl = mindcacheRef.current.get_data_url('tweet_image');
    setTweetImage(dataUrl);
  };

  // Handle form input changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current.set_value(field, value);
    setStmVersion(v => v + 1);
  };

  // Handle tool calls
  const handleToolCall = async (toolCall: TypedToolCall<ToolSet>) => {
    console.log('🔧 Tool call executed:', toolCall);
  };

  // Workflow handlers
  const handleSendPrompt = (prompt: string) => {
    setWorkflowPrompt(prompt);
  };

  const handleWorkflowPromptSent = () => {
    setWorkflowPrompt('');
  };

  const handleExecutionComplete = () => {
    console.log('Workflow execution complete');
  };

  const handleStatusChange = (status: string) => {
    setChatStatus(status);
  };

  const getInitialMessages = () => {
    return [
      {
        id: 'welcome-message',
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: 'Hello! I can help you create tweets with AI-generated images. Fill in the form fields (Topic, Company, Audience) and then run the workflow to automatically generate a complete tweet with an image. Everything syncs to the cloud!'
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
          <div className="text-gray-400 text-sm">Run the workflow to generate tweet content and image.</div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface
            onToolCall={handleToolCall}
            initialMessages={getInitialMessages()}
            workflowPrompt={workflowPrompt}
            onWorkflowPromptSent={handleWorkflowPromptSent}
            onStatusChange={handleStatusChange}
            stmLoaded={stmLoaded}
            stmVersion={stmVersion}
            systemPrompt={`You are a helpful marketing assistant that creates engaging tweets with images.

WORKFLOW STEPS:
1. When asked to search about a topic, use web search and store the summary in 'content_summary'
2. When asked to search about a company, use web search and store the summary in 'company_summary'
3. When asked to write a tweet, create engaging content using the provided information and store it in 'tweet'
4. When asked to generate a tweet image, use generate_image with the prompt based on the tweet content and store it as 'tweet_image'

Available fields in STM:
- topic: The main topic to research
- company: The company name
- audience: Target audience
- content_summary: Summary of topic research
- company_summary: Summary of company research
- tweet: The generated tweet text
- tweet_image: The generated tweet image

Always use {{fieldname}} to reference values from STM in your responses and tool calls.`}
            mindcacheInstance={mindcacheRef.current}
          />

          {/* Workflow Component */}
          <div className="mt-2">
            <Workflows
              onSendPrompt={handleSendPrompt}
              isExecuting={chatStatus !== 'ready'}
              onExecutionComplete={handleExecutionComplete}
              stmLoaded={stmLoaded}
              stmVersion={stmVersion}
              workflow={WORKFLOW_STEPS}
              mindcacheInstance={mindcacheRef.current}
            />
          </div>
        </div>
      </div>

      {/* Right Panel - Form and Tweet Preview */}
      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Tweet Generator</div>
            <div className="text-gray-400 text-sm">All fields synced to cloud</div>
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

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4 overflow-y-auto">
          {/* Form Fields */}
          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Topic</label>
            <input
              type="text"
              value={formData.topic}
              onChange={(e) => handleChange('topic', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="e.g., AI in healthcare"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="e.g., TechCorp"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-mono text-sm mb-2">Audience</label>
            <input
              type="text"
              value={formData.audience}
              onChange={(e) => handleChange('audience', e.target.value)}
              className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
              placeholder="e.g., Healthcare professionals"
            />
          </div>

          {/* Summaries */}
          <div className="pt-4 border-t border-gray-700 space-y-2">
            <div>
              <div className="text-gray-500 text-xs mb-1">Content Summary:</div>
              <div className="text-gray-400 text-xs">
                {contentSummary || <span className="text-gray-600 italic">Will be generated by workflow...</span>}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Company Summary:</div>
              <div className="text-gray-400 text-xs">
                {companySummary || <span className="text-gray-600 italic">Will be generated by workflow...</span>}
              </div>
            </div>
          </div>

          {/* Tweet Preview */}
          <div className="pt-4 border-t border-gray-700">
            <div className="text-gray-400 font-mono text-sm mb-3">Tweet Preview</div>
            <div className="bg-gray-900 border border-gray-700 rounded p-4">
              {/* Tweet Text */}
              <div className="mb-3">
                {tweetText ? (
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{tweetText}</p>
                ) : (
                  <p className="text-gray-600 text-sm italic">Tweet text will appear here...</p>
                )}
              </div>

              {/* Tweet Image */}
              <div className="border border-gray-700 rounded overflow-hidden bg-black" style={{ minHeight: '200px' }}>
                {tweetImage ? (
                  <img 
                    src={tweetImage} 
                    alt="Tweet image" 
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-gray-600 text-sm italic">Tweet image will appear here...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

