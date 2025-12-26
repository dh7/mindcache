'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';
import Workflows from './Workflows';

const WORKFLOW_STEPS = `1. Search about {{topic}} and write a summary into content_summary
2. Search about {{company}} and write a company summary into company_summary
3. Write a tweet about {{topic}} for {{audience}} on behalf of {{company}}. Store in tweet.
4. Generate an image for the tweet. Store as tweet_image.`;

export default function TweetWorkflowExample() {
  const { getInstanceId, error: instanceError } = useInstances();
  const instanceId = getInstanceId('workflow');

  // Create MindCache with cloud config
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

  const [formData, setFormData] = useState({ topic: '', company: '', audience: '' });
  const [contentSummary, setContentSummary] = useState('');
  const [companySummary, setCompanySummary] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [tweetImage, setTweetImage] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [workflowPrompt, setWorkflowPrompt] = useState('');
  const [chatStatus, setChatStatus] = useState('ready');

  const loadFormData = () => {
    const mc = mindcacheRef.current;
    if (!mc) return;

    setFormData({
      topic: mc.get_value('topic') || '',
      company: mc.get_value('company') || '',
      audience: mc.get_value('audience') || ''
    });
    setContentSummary(mc.get_value('content_summary') || '');
    setCompanySummary(mc.get_value('company_summary') || '');
    setTweetText(mc.get_value('tweet') || '');
    setTweetImage(mc.get_data_url('tweet_image'));
  };

  useEffect(() => {
    const mc = mindcacheRef.current;
    if (!mc) return;

    const handleChange = () => {
      setIsLoaded(mc.isLoaded);
      setConnectionState(mc.connectionState);

      if (mc.isLoaded) {
        // Initialize fields if they don't exist
        const fields = [
          { key: 'topic', value: '' },
          { key: 'company', value: '' },
          { key: 'audience', value: '' },
          { key: 'content_summary', value: '' },
          { key: 'company_summary', value: '' },
          { key: 'tweet', value: '' },
          { key: 'tweet_image', value: '', type: 'image' },
        ];

        fields.forEach(({ key, value, type }) => {
          if (!mc.has(key)) {
            mc.set_value(key, value, {
              systemTags: ['SystemPrompt', 'LLMWrite'], type: (type || 'text') as 'text' | 'image' | 'file' | 'json'
            });
          }
        });

        loadFormData();
      }

      setStmVersion(v => v + 1);
    };

    handleChange();
    mc.subscribeToAll(handleChange);
    return () => mc.unsubscribeFromAll(handleChange);
  }, [instanceId]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current?.set_value(field, value);
    setStmVersion(v => v + 1);
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
            {instanceError || 'Workflow instance ID not set.'}
          </p>
          <div className="text-left bg-gray-900 p-4 rounded-lg border border-gray-700">
            <p className="text-gray-500 text-xs mb-2">Add to .env.local:</p>
            <code className="text-green-400 text-sm">
              NEXT_PUBLIC_INSTANCE_WORKFLOW=your-instance-id
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
          <div className="text-gray-400 text-sm">Run the workflow to generate a tweet.</div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface
            instanceId={instanceId}
            workflowPrompt={workflowPrompt}
            onWorkflowPromptSent={() => setWorkflowPrompt('')}
            onStatusChange={setChatStatus}
            stmLoaded={isLoaded}
            stmVersion={stmVersion}
            mindcacheInstance={mindcacheRef.current!}
          />
          <div className="mt-2">
            <Workflows
              onSendPrompt={setWorkflowPrompt}
              isExecuting={chatStatus !== 'ready'}
              onExecutionComplete={() => { }}
              stmLoaded={isLoaded}
              stmVersion={stmVersion}
              workflow={WORKFLOW_STEPS}
              mindcacheInstance={mindcacheRef.current!}
            />
          </div>
        </div>
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Tweet Generator</div>
            <div className="text-gray-400 text-sm font-mono">{instanceId.slice(0, 8)}...</div>
          </div>
          <span className={`${getStatusColor()} text-lg`} title={connectionState}>{getStatusIcon()}</span>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4 overflow-y-auto">
          {!isLoaded ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading... ({connectionState})
            </div>
          ) : (
            <>
              {['topic', 'company', 'audience'].map(field => (
                <div key={field}>
                  <label className="block text-gray-400 font-mono text-sm mb-2 capitalize">{field}</label>
                  <input
                    type="text"
                    value={formData[field as keyof typeof formData]}
                    onChange={(e) => handleChange(field, e.target.value)}
                    className="w-full bg-black border border-gray-600 rounded text-cyan-400 font-mono text-sm px-3 py-2 focus:outline-none focus:border-gray-400"
                  />
                </div>
              ))}

              <div className="pt-4 border-t border-gray-700 space-y-2">
                <div>
                  <div className="text-gray-500 text-xs mb-1">Content Summary:</div>
                  <div className="text-gray-400 text-xs">{contentSummary || <span className="italic">Generated by workflow...</span>}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Company Summary:</div>
                  <div className="text-gray-400 text-xs">{companySummary || <span className="italic">Generated by workflow...</span>}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <div className="text-gray-400 font-mono text-sm mb-3">Tweet Preview</div>
                <div className="bg-gray-900 border border-gray-700 rounded p-4">
                  <div className="mb-3">
                    {tweetText ? (
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{tweetText}</p>
                    ) : (
                      <p className="text-gray-600 text-sm italic">Tweet text will appear here...</p>
                    )}
                  </div>
                  <div className="border border-gray-700 rounded overflow-hidden bg-black" style={{ minHeight: '200px' }}>
                    {tweetImage ? (
                      <img src={tweetImage} alt="Tweet" className="w-full h-auto" />
                    ) : (
                      <div className="flex items-center justify-center h-48">
                        <p className="text-gray-600 text-sm italic">Image will appear here...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
