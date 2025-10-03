'use client'

import React, { useState } from 'react'
import ClientSTMDemo from '@/components/ClientSTMDemo'
import FormExample from '@/components/FormExample'
import ImageExample from '@/components/ImageExample'

type DemoType = 'form' | 'image' | 'read' | 'write' | 'images' | 'workflow' | 'mindcache-editor'

export default function Home() {
  const [selectedDemo, setSelectedDemo] = useState<DemoType>('form')

  const demos = [
    { id: 'form' as DemoType, label: 'Form' },
    { id: 'image' as DemoType, label: 'Image' },
    { id: 'read' as DemoType, label: 'Read' },
    { id: 'write' as DemoType, label: 'Write' },
    { id: 'images' as DemoType, label: 'Images' },
    { id: 'workflow' as DemoType, label: 'Workflow' },
    { id: 'mindcache-editor' as DemoType, label: 'MindCache Editor' },
  ]

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex">
      {/* Left Navigation Menu */}
      <div className="w-48 bg-black p-6">
        <div className="mb-6">
          <div className="text-green-400 mb-1">MindCache Demos</div>
        </div>
        
        <nav className="space-y-1">
          {demos.map((demo) => (
            <button
              key={demo.id}
              onClick={() => setSelectedDemo(demo.id)}
              className={`w-full text-left ${
                selectedDemo === demo.id
                  ? 'text-green-400'
                  : 'text-green-400 opacity-50 hover:opacity-100'
              }`}
            >
              {selectedDemo === demo.id ? '> ' : '  '}
              {demo.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {selectedDemo === 'form' && <FormExample />}
        {selectedDemo === 'image' && <ImageExample />}
        {selectedDemo === 'mindcache-editor' && <ClientSTMDemo />}
        
        {selectedDemo !== 'form' && selectedDemo !== 'image' && selectedDemo !== 'mindcache-editor' && (
          <div className="h-screen flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="text-2xl text-green-400 mb-4">
                {demos.find(d => d.id === selectedDemo)?.label}
              </div>
              <div className="text-green-400 opacity-50">
                Coming soon...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
