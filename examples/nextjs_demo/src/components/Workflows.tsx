'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { mindcache } from 'mindcache';

interface WorkflowsProps {
  onSendPrompt: (prompt: string) => void;
  isExecuting: boolean;
  onExecutionComplete: () => void;
  stmLoaded?: boolean; // Track STM loading state
  stmVersion?: number; // Track STM changes to refresh getTagged values
}

export default function Workflows({ onSendPrompt, isExecuting, onExecutionComplete, stmLoaded, stmVersion }: WorkflowsProps) {
  // Get workflow from tagged content or use default
  const getWorkflowText = () => {
    if (!stmLoaded) {
      return '1. Say hello to the user';
    }

    const workflowTagged = mindcache.getTagged("Workflow");
    const workflowText = workflowTagged 
      ? workflowTagged.split(': ').slice(1).join(': ') // Extract value part after "key: "
      : '1. Say hello to the user';
    
    return workflowText;
  };

  const [workflowText, setWorkflowText] = useState('1. Say hello to the user'); // Start with default
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update workflow text when STM loads or tagged content changes
  useEffect(() => {
    if (stmLoaded) {
      const newWorkflowText = getWorkflowText();
      setWorkflowText(newWorkflowText);
    }
  }, [stmLoaded, stmVersion]);

  // Parse workflow text into individual prompts
  const parseWorkflowSteps = (text: string): string[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const steps: string[] = [];
    
    for (const line of lines) {
      // Match patterns like "1.", "1)", "- ", "* ", etc.
      const match = line.match(/^\s*(?:\d+[.)]\s*|[-*]\s*)(.*)/);
      if (match && match[1].trim()) {
        steps.push(match[1].trim());
      }
    }
    
    return steps;
  };

  const steps = parseWorkflowSteps(workflowText);

  // Start workflow execution
  const startWorkflow = () => {
    if (steps.length === 0) {
      return;
    }
    
    setIsRunning(true);
    setCurrentStep(0);
    executeStep(0);
  };

  // Execute a single step
  const executeStep = useCallback((stepIndex: number) => {
    if (stepIndex >= steps.length) {
      // Workflow complete
      setIsRunning(false);
      setCurrentStep(0);
      onExecutionComplete();
      return;
    }

    const rawPrompt = steps[stepIndex];
    // Send raw prompt with {{key}} placeholders - ChatInterface will process it
    setCurrentStep(stepIndex);
    onSendPrompt(rawPrompt);
  }, [steps, onExecutionComplete, onSendPrompt]);

  // Move to next step
  const executeNextStep = useCallback(() => {
    if (executionTimeoutRef.current) {
      clearTimeout(executionTimeoutRef.current);
      executionTimeoutRef.current = null;
    }

    const nextStep = currentStep + 1;
    if (nextStep < steps.length) {
      setTimeout(() => executeStep(nextStep), 500); // Small delay between steps
    } else {
      setIsRunning(false);
      setCurrentStep(0);
      onExecutionComplete();
    }
  }, [currentStep, steps.length, onExecutionComplete, executeStep]);

  // Stop workflow execution
  const stopWorkflow = () => {
    if (executionTimeoutRef.current) {
      clearTimeout(executionTimeoutRef.current);
      executionTimeoutRef.current = null;
    }
    setIsRunning(false);
    setCurrentStep(0);
  };

  // Monitor execution state changes - move to next step when current execution completes
  useEffect(() => {
    if (isRunning && !isExecuting) {
      // Add a small delay to ensure the AI response is fully processed
      const timeoutId = setTimeout(() => {
        executeNextStep();
      }, 2000); // 2 second delay between steps
      
      return () => clearTimeout(timeoutId);
    }
  }, [isExecuting, isRunning, executeNextStep]);

  return (
    <div className="mb-4 border border-green-400 rounded">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-green-400">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-green-400 hover:text-green-300 transition-colors"
          >
            <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>
          <h3 className="text-green-400 font-semibold">Workflows</h3>
          {isRunning && (
            <span className="text-yellow-400 text-sm">
              Running step {currentStep + 1}/{steps.length}
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={startWorkflow}
              disabled={steps.length === 0 || isExecuting}
              className="bg-green-400 text-black px-3 py-1 text-sm rounded hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ▶ Run ({steps.length})
            </button>
          ) : (
            <button
              onClick={stopWorkflow}
              className="bg-red-400 text-black px-3 py-1 text-sm rounded hover:bg-red-300 transition-colors"
            >
              ⏹ Stop
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3">
          {/* Step preview */}
          {steps.length > 0 && (
            <div className="mt-3 p-2 bg-green-900 bg-opacity-20 rounded">
              <div className="text-green-300 text-xs mb-2">Preview ({steps.length} steps):</div>
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`text-xs mb-1 ${
                    isRunning && index === currentStep
                      ? 'text-yellow-400 font-semibold'
                      : isRunning && index < currentStep
                      ? 'text-green-500 line-through'
                      : 'text-green-400'
                  }`}
                >
                  {index + 1}. {step}
                  {isRunning && index === currentStep && ' ⏳'}
                  {isRunning && index < currentStep && ' ✓'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
