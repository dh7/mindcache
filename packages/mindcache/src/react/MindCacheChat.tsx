'use client';

import React, { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { useClientChat, type ChatMessage, type UseClientChatOptions } from './useClientChat';
import { useMindCacheContext } from './MindCacheContext';

/**
 * Chat theme configuration
 */
export interface ChatTheme {
  /** Container background */
  background?: string;
  /** User message background */
  userBubble?: string;
  /** Assistant message background */
  assistantBubble?: string;
  /** Text color */
  textColor?: string;
  /** Secondary text color */
  secondaryTextColor?: string;
  /** Border color */
  borderColor?: string;
  /** Primary/accent color */
  primaryColor?: string;
  /** Font family */
  fontFamily?: string;
}

/**
 * Default dark theme
 */
const defaultTheme: ChatTheme = {
  background: '#000',
  userBubble: '#1a1a2e',
  assistantBubble: '#0d0d0d',
  textColor: '#22c55e',
  secondaryTextColor: '#6b7280',
  borderColor: '#333',
  primaryColor: '#22c55e',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
};

/**
 * MindCacheChat props
 */
export interface MindCacheChatProps extends Omit<UseClientChatOptions, 'mindcache'> {
  /** Custom theme */
  theme?: ChatTheme;
  /** Placeholder text for input */
  placeholder?: string;
  /** Welcome message (shown when no messages) */
  welcomeMessage?: string;
  /** Show API key input if not configured */
  showApiKeyInput?: boolean;
  /** Custom class name for container */
  className?: string;
  /** Custom styles for container */
  style?: React.CSSProperties;
  /** Render custom message component */
  renderMessage?: (message: ChatMessage) => React.ReactNode;
  /** Header component */
  header?: React.ReactNode;
  /** Footer component (below input) */
  footer?: React.ReactNode;
}

/**
 * Default message renderer
 */
function DefaultMessage({
  message,
  theme
}: {
  message: ChatMessage;
  theme: ChatTheme;
}) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px'
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: isUser ? theme.userBubble : theme.assistantBubble,
          border: `1px solid ${theme.borderColor}`
        }}
      >
        <div
          style={{
            fontSize: '10px',
            color: theme.secondaryTextColor,
            marginBottom: '4px',
            textTransform: 'uppercase'
          }}
        >
          {isUser ? 'You' : 'Assistant'}
        </div>
        <div
          style={{
            color: theme.textColor,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

/**
 * API Key input component
 */
function ApiKeyInput({
  theme,
  onSubmit
}: {
  theme: ChatTheme;
  onSubmit: (key: string) => void;
}) {
  const [key, setKey] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onSubmit(key.trim());
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '20px'
      }}
    >
      <div
        style={{
          fontSize: '14px',
          color: theme.textColor,
          marginBottom: '16px',
          textAlign: 'center'
        }}
      >
        Enter your API key to start chatting
      </div>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '400px' }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: theme.assistantBubble,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: '8px',
            color: theme.textColor,
            fontFamily: theme.fontFamily,
            fontSize: '14px',
            marginBottom: '12px'
          }}
        />
        <button
          type="submit"
          disabled={!key.trim()}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: theme.primaryColor,
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontFamily: theme.fontFamily,
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: key.trim() ? 'pointer' : 'not-allowed',
            opacity: key.trim() ? 1 : 0.5
          }}
        >
          Save & Start
        </button>
      </form>
      <div
        style={{
          fontSize: '11px',
          color: theme.secondaryTextColor,
          marginTop: '16px',
          textAlign: 'center'
        }}
      >
        Your key is stored locally and never sent to our servers.
      </div>
    </div>
  );
}

/**
 * MindCacheChat - Ready-to-use chat component for local-first AI
 *
 * @example
 * ```tsx
 * <MindCacheProvider ai={{ keyStorage: 'localStorage' }}>
 *   <MindCacheChat
 *     welcomeMessage="Hello! How can I help you today?"
 *     placeholder="Ask me anything..."
 *   />
 * </MindCacheProvider>
 * ```
 */
export function MindCacheChat({
  theme: customTheme,
  placeholder = 'Type a message...',
  welcomeMessage = 'Hello! I\'m ready to help you.',
  showApiKeyInput = true,
  className,
  style,
  renderMessage,
  header,
  footer,
  initialMessages,
  ...chatOptions
}: MindCacheChatProps) {
  const context = useMindCacheContext();
  const theme = { ...defaultTheme, ...customTheme };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Initialize with welcome message if no initial messages
  const defaultInitialMessages: ChatMessage[] = welcomeMessage ? [
    {
      id: 'welcome',
      role: 'assistant',
      content: welcomeMessage,
      createdAt: new Date()
    }
  ] : [];

  const {
    messages,
    sendMessage,
    isLoading,
    error,
    streamingContent,
    stop
  } = useClientChat({
    ...chatOptions,
    initialMessages: initialMessages || defaultInitialMessages,
    mindcache: context.mindcache || undefined
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle submit
  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) {
      return;
    }

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  };

  // Handle keyboard
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Show API key input if needed
  if (showApiKeyInput && !context.hasApiKey && context.aiConfig.keyStorage !== 'memory') {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: theme.background,
          fontFamily: theme.fontFamily,
          ...style
        }}
      >
        {header}
        <ApiKeyInput
          theme={theme}
          onSubmit={(key) => context.setApiKey(key)}
        />
        {footer}
      </div>
    );
  }

  // Loading state
  if (!context.isLoaded) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: theme.background,
          color: theme.textColor,
          fontFamily: theme.fontFamily,
          ...style
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: theme.background,
        fontFamily: theme.fontFamily,
        ...style
      }}
    >
      {header}

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px'
        }}
      >
        {messages.map((message) => (
          renderMessage ? (
            <React.Fragment key={message.id}>
              {renderMessage(message)}
            </React.Fragment>
          ) : (
            <DefaultMessage key={message.id} message={message} theme={theme} />
          )
        ))}

        {/* Show streaming content in real-time */}
        {streamingContent && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '12px'
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: theme.assistantBubble,
                border: `1px solid ${theme.borderColor}`
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: theme.secondaryTextColor,
                  marginBottom: '4px',
                  textTransform: 'uppercase'
                }}
              >
                Assistant
              </div>
              <div
                style={{
                  color: theme.textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5
                }}
              >
                {streamingContent}
                <span style={{ opacity: 0.5, animation: 'blink 1s infinite' }}>▊</span>
              </div>
            </div>
          </div>
        )}

        {/* Show loading indicator only when not streaming yet */}
        {isLoading && !streamingContent && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '12px'
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: theme.assistantBubble,
                border: `1px solid ${theme.borderColor}`,
                color: theme.secondaryTextColor
              }}
            >
              Thinking...
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '12px',
              marginBottom: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '13px'
            }}
          >
            Error: {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${theme.borderColor}`
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end'
          }}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Auto-resize textarea
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Waiting for response...' : placeholder}
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: theme.assistantBubble,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: '8px',
              color: theme.textColor,
              fontFamily: theme.fontFamily,
              fontSize: '16px', // Prevents iOS zoom on focus
              resize: 'none',
              minHeight: '44px', // Apple touch target minimum
              maxHeight: '120px',
              outline: 'none',
              WebkitAppearance: 'none' // Remove iOS styling
            }}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              style={{
                padding: '12px 20px',
                minWidth: '44px', // Touch target
                minHeight: '44px', // Touch target
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontFamily: theme.fontFamily,
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation' // Faster touch response
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim()}
              style={{
                padding: '12px 20px',
                minWidth: '44px', // Touch target
                minHeight: '44px', // Touch target
                backgroundColor: theme.primaryColor,
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontFamily: theme.fontFamily,
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: !inputValue.trim() ? 'not-allowed' : 'pointer',
                opacity: !inputValue.trim() ? 0.5 : 1,
                transition: 'opacity 0.2s',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation' // Faster touch response
              }}
            >
              Send
            </button>
          )}
        </div>
      </form>

      {footer}
    </div>
  );
}
