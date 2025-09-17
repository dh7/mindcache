'use client'
/* eslint-disable no-console */

import React, { useState, useEffect } from 'react'
import { mindcache } from 'mindcache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Brain, Settings, User, Calendar, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface ToolCall {
  toolName: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

export default function AIToolsDemo() {
  const [stmData, setStmData] = useState<Record<string, unknown>>({})
  const [userPrompt, setUserPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [aiResponse, setAiResponse] = useState('')

  // Initialize STM with some default keys for the demo and set up listeners
  useEffect(() => {
    console.log('🏁 Initializing client-side STM for demo')
    
    // Initialize STM keys
    mindcache.set('name', '')
    mindcache.set('age', '')
    mindcache.set('occupation', '')
    
    // Set initial state
    setStmData(mindcache.getAll())
    
    // Set up listener for STM changes to update React state
    const updateReactState = () => {
      const newStmData = mindcache.getAll()
      console.log('🔄 STM changed, updating React state:', newStmData)
      setStmData(newStmData)
    }
    
    // Subscribe to all STM changes
    mindcache.subscribeToAll(updateReactState)
    
    return () => {
      console.log('🧹 Cleaning up STM listeners')
      // Note: MindCache doesn't have unsubscribe yet, but this is the pattern
    }
  }, [])

  const handleSubmit = async () => {
    if (!userPrompt.trim()) {
      setError('Please enter a prompt first.')
      return
    }

    console.log('🚀 Starting AI Tools request with prompt:', userPrompt)
    
    setIsGenerating(true)
    setError('')
    setToolCalls([])
    setAiResponse('')
    
    try {
      // Send current STM data to the API
      const response = await fetch('/api/ai-tools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: userPrompt,
          stmData: stmData
        })
      })

      console.log('📡 API response status:', response.status)
      const data = await response.json()
      console.log('📦 API response data:', data)

      if (!response.ok) {
        throw new Error(data.error || 'API request failed')
      }

      console.log('✨ Processing tool calls:', data.toolCalls)
      console.log('💬 Setting AI response:', data.response)

      // Execute tool instructions on client-side STM
      if (data.toolCalls) {
        console.log('🔍 Examining tool calls for execution:', data.toolCalls)
        data.toolCalls.forEach((toolCall: ToolCall, index: number) => {
          console.log(`🔍 Tool call ${index}:`, toolCall)
          console.log(`🔍 Tool result:`, toolCall.result)
          if (toolCall.result && typeof toolCall.result === 'object' && 'action' in toolCall.result) {
            const instruction = toolCall.result as { action: string; key: string; value: string; result: string }
            console.log(`🎯 Found valid instruction:`, instruction)
            if (instruction.action === 'set_stm') {
              console.log(`🔧 Executing client-side STM update: ${instruction.key} = ${instruction.value}`)
              mindcache.set(instruction.key, instruction.value)
              console.log(`✅ STM updated, new value for ${instruction.key}:`, mindcache.get(instruction.key))
            }
          } else {
            console.log(`❌ Tool call ${index} has invalid result:`, toolCall.result)
          }
        })
      }

      setToolCalls(data.toolCalls || [])
      setAiResponse(data.response || '')
      
      // STM state will be updated automatically via listeners
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsGenerating(false)
    }
  }

  const resetDemo = () => {
    console.log('🔄 Resetting demo - clearing STM and UI state')
    
    // Reset STM on client side
    mindcache.set('name', '')
    mindcache.set('age', '')
    mindcache.set('occupation', '')
    
    // Reset UI state
    setUserPrompt('')
    setToolCalls([])
    setAiResponse('')
    setError('')
    
    // STM state will be updated automatically via listeners
  }

  return (
    <div className="space-y-6">
      {/* Demo Description */}
      <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-50 to-purple-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-slate-800">AI Tools Demo</h3>
            <p className="text-sm text-slate-600">
              This demo showcases how AI can write to STM using dynamically generated tools. 
              Try prompts like &quot;My name is John, I&apos;m 25 years old, and I work as a software engineer&quot;
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Input */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <User className="h-5 w-5 text-purple-600" />
            Your Message
          </CardTitle>
          <CardDescription>
            Tell the AI about yourself and watch it update the STM using tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="prompt" className="text-slate-700">Message</Label>
            <Textarea
              id="prompt"
              className="min-h-[100px] border-slate-200 focus:border-purple-400"
              placeholder="e.g., My name is Sarah, I&apos;m 28 years old, and I work as a data scientist..."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleSubmit} 
              disabled={isGenerating}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Send to AI
                </>
              )}
            </Button>
            <Button 
              onClick={resetDemo}
              variant="outline"
              className="border-slate-200"
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* STM Display Card */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
        <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Brain className="h-5 w-5 text-green-600" />
            Current STM State
          </CardTitle>
          <CardDescription>
            Watch how AI tools update the Short-Term Memory in real-time
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm">
            <div className="space-y-2">
              {Object.entries(stmData).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3 py-1">
                  {key === '$date' && <Calendar className="h-4 w-4 text-blue-500" />}
                  {key === '$time' && <Clock className="h-4 w-4 text-green-500" />}
                  {!key.startsWith('$') && <User className="h-4 w-4 text-purple-500" />}
                  <span className="font-semibold text-blue-600 min-w-[100px]">{key}:</span>
                  <span className={`text-slate-700 ${!value && !key.startsWith('$') ? 'italic text-slate-400' : ''}`}>
                    {String(value) || (!key.startsWith('$') ? '(empty)' : String(value))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tool Calls Display */}
      {toolCalls.length > 0 && (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Settings className="h-5 w-5 text-orange-600" />
              AI Tool Calls
            </CardTitle>
            <CardDescription>
              Tools that the AI used to update the STM
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {toolCalls.map((toolCall, index) => (
                <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-orange-800 text-sm">
                        {toolCall.toolName}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Args: {JSON.stringify(toolCall.args)}
                      </div>
                      {toolCall.result && (
                        <div className="text-xs text-green-700 mt-1">
                          Result: {typeof toolCall.result === 'object' && toolCall.result && 'result' in toolCall.result ? String(toolCall.result.result) : JSON.stringify(toolCall.result)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Response */}
      {aiResponse && (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg">
            <CardTitle className="text-slate-800">AI Response</CardTitle>
            <CardDescription>
              The AI&apos;s response after updating the STM
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResponse}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
