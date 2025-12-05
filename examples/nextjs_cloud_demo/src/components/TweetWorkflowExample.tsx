'use client';

import { useRef, useEffect, useState } from 'react';
import { MindCache, CloudAdapter, ConnectionState } from 'mindcache';
import { useInstances } from './InstanceProvider';
import ChatInterface from './ChatInterface';
import Workflows from './Workflows';

const WORKFLOW_STEPS = `1. Search about {{topic}} and write a summary into content_summary
2. Search about {{company}} and write a company summary into company_summary
3. Write a tweet about {{topic}} for {{audience}} on behalf of {{company}}. Store in tweet.
4. Generate an image for the tweet. Store as tweet_image.`;

export default function TweetWorkflowExample() {
  const { getInstanceId } = useInstances();
  const instanceId = getInstanceId('workflow');
  
  const mindcacheRef = useRef(new MindCache());
  const cloudAdapterRef = useRef<CloudAdapter | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [formData, setFormData] = useState({ topic: '', company: '', audience: '' });
  const [contentSummary, setContentSummary] = useState('');
  const [companySummary, setCompanySummary] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [tweetImage, setTweetImage] = useState<string | undefined>(undefined);
  const [stmVersion, setStmVersion] = useState(0);
  const [stmLoaded, setStmLoaded] = useState(false);
  const [workflowPrompt, setWorkflowPrompt] = useState('');
  const [chatStatus, setChatStatus] = useState('ready');

  useEffect(() => {
    if (!instanceId) return;

    const apiKey = process.env.NEXT_PUBLIC_MINDCACHE_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_MINDCACHE_API_URL?.replace('https://', 'wss://');

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
      if (!mindcacheRef.current.has(key)) {
        mindcacheRef.current.set_value(key, value, { 
          visible: true, readonly: false, type: type as any 
        });
      }
    });

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

    loadFormData();
    mindcacheRef.current.subscribeToAll(loadFormData);

    return () => {
      mindcacheRef.current.unsubscribeFromAll(loadFormData);
      cloudAdapterRef.current?.disconnect();
      cloudAdapterRef.current?.detach();
    };
  }, [instanceId]);

  const loadFormData = () => {
    setFormData({
      topic: mindcacheRef.current.get_value('topic') || '',
      company: mindcacheRef.current.get_value('company') || '',
      audience: mindcacheRef.current.get_value('audience') || ''
    });
    setContentSummary(mindcacheRef.current.get_value('content_summary') || '');
    setCompanySummary(mindcacheRef.current.get_value('company_summary') || '');
    setTweetText(mindcacheRef.current.get_value('tweet') || '');
    setTweetImage(mindcacheRef.current.get_data_url('tweet_image'));
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    mindcacheRef.current.set_value(field, value);
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
        <div className="text-yellow-400">Waiting for instance...</div>
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
            stmLoaded={stmLoaded}
            stmVersion={stmVersion}
            mindcacheInstance={mindcacheRef.current}
          />
          <div className="mt-2">
            <Workflows
              onSendPrompt={setWorkflowPrompt}
              isExecuting={chatStatus !== 'ready'}
              onExecutionComplete={() => {}}
              stmLoaded={stmLoaded}
              stmVersion={stmVersion}
              workflow={WORKFLOW_STEPS}
              mindcacheInstance={mindcacheRef.current}
            />
          </div>
        </div>
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-cyan-400 mb-2">Tweet Generator</div>
            <div className="text-gray-400 text-sm">Instance: {instanceId.slice(0, 8)}...</div>
          </div>
          <span className={`${getStatusColor()} text-lg`}>{getStatusIcon()}</span>
        </div>

        <div className="flex-1 border border-gray-600 rounded p-6 space-y-4 overflow-y-auto">
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
        </div>
      </div>
    </div>
  );
}
