'use client'

import React, { useState } from 'react'
import { InstanceProvider, useInstances } from '@/components/InstanceProvider'
import CloudSTMDemo from '@/components/CloudSTMDemo'
import FormExample from '@/components/FormExample'
import ImageExample from '@/components/ImageExample'
import TweetWorkflowExample from '@/components/TweetWorkflowExample'

type DemoType = 'form' | 'image' | 'workflow' | 'mindcache-editor'

function DemoSelector() {
  const [selectedDemo, setSelectedDemo] = useState<DemoType>('form')
  const { isLoading, error, projectId, instances } = useInstances()

  const demos = [
    { id: 'form' as DemoType, label: 'Form' },
    { id: 'image' as DemoType, label: 'Image' },
    { id: 'workflow' as DemoType, label: 'Workflow' },
    { id: 'mindcache-editor' as DemoType, label: 'MindCache Editor' },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">☁️ Connecting to MindCache Cloud...</div>
          <div className="animate-pulse">●●●</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 font-mono flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-2xl mb-4 text-red-400">⚠️ Connection Error</div>
          <div className="text-gray-400 mb-4">{error}</div>
          <div className="text-sm text-gray-500">
            Make sure MINDCACHE_API_KEY and MINDCACHE_PROJECT_ID are set in .env.local
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-cyan-400 font-mono flex">
      {/* Left Navigation Menu */}
      <div className="w-48 bg-black p-6 border-r border-gray-800">
        <div className="mb-6">
          <div className="text-cyan-400 mb-1">☁️ Cloud Demo</div>
          <div className="text-cyan-600 text-xs">Project: {projectId?.slice(0, 8)}...</div>
        </div>
        
        <nav className="space-y-1">
          {demos.map((demo) => (
            <button
              key={demo.id}
              onClick={() => setSelectedDemo(demo.id)}
              className={`w-full text-left ${
                selectedDemo === demo.id
                  ? 'text-cyan-400'
                  : 'text-cyan-400 opacity-50 hover:opacity-100'
              }`}
            >
              {selectedDemo === demo.id ? '> ' : '  '}
              {demo.label}
              {instances[demo.id] && (
                <span className="text-green-400 ml-1 text-xs">●</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-6 pt-6 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            Each demo has its own instance
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {selectedDemo === 'form' && <FormExample />}
        {selectedDemo === 'image' && <ImageExample />}
        {selectedDemo === 'workflow' && <TweetWorkflowExample />}
        {selectedDemo === 'mindcache-editor' && <CloudSTMDemo />}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <InstanceProvider>
      <DemoSelector />
    </InstanceProvider>
  )
}
