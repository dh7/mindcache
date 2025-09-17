'use client'

import React, { useState, useEffect } from 'react'
import { mindcache } from 'mindcache'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Brain, Sparkles, User, Calendar, Clock, Wand2, Loader2 } from 'lucide-react'

export default function TemplatedPromptDemo() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    age: '',
    gender: ''
  })
  
  const [template, setTemplate] = useState(
    `Create a personalized introduction for {firstName} {lastName}, who is {age} years old and identifies as {gender}. The introduction should be warm, professional, and suitable for a networking event. Include some interesting conversation starters based on their demographic. Write it in a friendly, engaging tone. Today's date is {$date} and the current time is {$time}.`
  )
  
  const [stmData, setStmData] = useState<Record<string, unknown>>({})
  const [processedPrompt, setProcessedPrompt] = useState('')
  const [aiResult, setAiResult] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Subscribe to STM changes
  useEffect(() => {
    const updateSTMDisplay = () => {
      setStmData(mindcache.getAll())
    }

    mindcache.subscribeToAll(updateSTMDisplay)
    updateSTMDisplay()

    return () => {
      mindcache.unsubscribeFromAll(updateSTMDisplay)
    }
  }, [])

  // Auto-update STM when form data changes
  useEffect(() => {
    mindcache.clear()
    Object.entries(formData).forEach(([key, value]) => {
      if (value) {
        mindcache.set(key, value)
      }
    })
  }, [formData])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('') // Clear errors when user types
  }

  const processTemplate = () => {
    if (!template.trim()) {
      setError('Please enter a template first.')
      return
    }

    const processed = mindcache.injectSTM(template)
    setProcessedPrompt(processed)
    setError('')
  }

  const generateWithAI = async () => {
    if (!processedPrompt) {
      setError('Please process the template first.')
      return
    }

    setIsGenerating(true)
    setError('')
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: processedPrompt
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'API request failed')
      }

      setAiResult(data.content)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Personal Information Card */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <User className="h-5 w-5 text-blue-600" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Fill out your information to populate the Short-Term Memory (STM)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-slate-700">First Name</Label>
              <Input
                id="firstName"
                placeholder="Enter your first name"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className="border-slate-200 focus:border-blue-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-slate-700">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Enter your last name"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className="border-slate-200 focus:border-blue-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age" className="text-slate-700">Age</Label>
              <Input
                id="age"
                type="number"
                placeholder="Enter your age"
                value={formData.age}
                onChange={(e) => handleInputChange('age', e.target.value)}
                className="border-slate-200 focus:border-blue-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender" className="text-slate-700">Gender</Label>
              <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                <SelectTrigger className="border-slate-200 focus:border-blue-400">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            Real-time view of your Short-Term Memory data
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm">
            {Object.keys(stmData).length === 2 ? (
              <p className="text-slate-500 text-center py-4">
                STM is empty. Fill out the form above to populate it.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stmData).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3 py-1">
                    {key === '$date' && <Calendar className="h-4 w-4 text-blue-500" />}
                    {key === '$time' && <Clock className="h-4 w-4 text-green-500" />}
                    {!key.startsWith('$') && <User className="h-4 w-4 text-purple-500" />}
                    <span className="font-semibold text-blue-600 min-w-[80px]">{key}:</span>
                    <span className="text-slate-700">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Template Card */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Prompt Template
          </CardTitle>
          <CardDescription>
            Use {`{key}`} syntax to inject STM values into your template
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="template" className="text-slate-700">Template</Label>
            <Textarea
              id="template"
              className="min-h-[120px] border-slate-200 focus:border-purple-400"
              placeholder="Enter your prompt template..."
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </div>
          <Button 
            onClick={processTemplate} 
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            Process Template
          </Button>
        </CardContent>
      </Card>

      {/* Processed Template Card */}
      {processedPrompt && (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-t-lg">
            <CardTitle className="text-slate-800">Processed Template</CardTitle>
            <CardDescription>
              Template with STM values injected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-slate-700 leading-relaxed">{processedPrompt}</p>
            </div>
            <Button 
              onClick={generateWithAI} 
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Generate with OpenAI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI Result Card */}
      {aiResult && (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg">
            <CardTitle className="text-slate-800">AI Generated Result</CardTitle>
            <CardDescription>
              Personalized content generated by OpenAI
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
