'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Brain, Sparkles, Settings, Monitor } from 'lucide-react'
import TemplatedPromptDemo from '@/components/TemplatedPromptDemo'
import AIToolsDemo from '@/components/AIToolsDemo'
import ClientSTMDemo from '@/components/ClientSTMDemo'

type DemoType = 'templated-prompt' | 'ai-tools' | 'type-safe-chat' | 'client-stm'

export default function Home() {
  const [activeDemo, setActiveDemo] = useState<DemoType>('templated-prompt')

  const demos = [
    {
      id: 'templated-prompt' as DemoType,
      title: 'Templated Prompt',
      description: 'STM injection with template processing',
      icon: Sparkles
    },
    {
      id: 'ai-tools' as DemoType,
      title: 'Writing to STM with Tools',
      description: 'AI updates STM using dynamic tools',
      icon: Settings
    },
    {
      id: 'client-stm' as DemoType,
      title: 'Client-Side STM',
      description: 'Browser-owned STM with tool execution',
      icon: Monitor
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-80 min-h-screen bg-white/80 backdrop-blur border-r border-slate-200 p-6">
          {/* Header */}
          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  MindCache
                </h1>
                <p className="text-sm text-slate-500">Demo Collection</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Explore different MindCache features through interactive demos
            </p>
          </div>

          {/* Demo List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Available Demos</h3>
            {demos.map((demo) => {
              const Icon = demo.icon
              return (
                <Button
                  key={demo.id}
                  onClick={() => setActiveDemo(demo.id)}
                  variant={activeDemo === demo.id ? "default" : "ghost"}
                  className={`w-full justify-start h-auto p-4 ${
                    activeDemo === demo.id
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-3 text-left">
                    <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      activeDemo === demo.id ? 'text-white' : 'text-slate-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${
                        activeDemo === demo.id ? 'text-white' : 'text-slate-800'
                      }`}>
                        {demo.title}
                      </div>
                      <div className={`text-xs mt-1 ${
                        activeDemo === demo.id ? 'text-blue-100' : 'text-slate-500'
                      }`}>
                        {demo.description}
                      </div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            {/* Demo Title */}
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">
                {demos.find(d => d.id === activeDemo)?.title}
              </h2>
              <p className="text-slate-600">
                {demos.find(d => d.id === activeDemo)?.description}
              </p>
            </div>

            {/* Demo Content */}
            {activeDemo === 'templated-prompt' && <TemplatedPromptDemo />}
            {activeDemo === 'ai-tools' && <AIToolsDemo />}
            {activeDemo === 'client-stm' && <ClientSTMDemo />}
          </div>
        </div>
      </div>
    </div>
  )
}
