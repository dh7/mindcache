'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MindCache } from '../core/MindCache';
import type * as Y from 'yjs';

export interface UseMindCacheDocumentResult {
  /** The Y.Text object for editor bindings (Quill, CodeMirror, etc.) */
  yText: Y.Text | undefined;
  /** Plain text content, updates reactively */
  text: string;
  /** Whether the document is ready to use */
  isReady: boolean;
  /** Insert text at a position */
  insertText: (index: number, text: string) => void;
  /** Delete text at a position */
  deleteText: (index: number, length: number) => void;
  /** Replace all text (uses diff-based updates) */
  replaceText: (newText: string) => void;
}

/**
 * React hook for collaborative document editing with MindCache.
 *
 * Provides reactive text state and Y.Text for editor bindings.
 * Automatically subscribes to changes and cleans up on unmount.
 *
 * @example
 * ```tsx
 * function Editor({ mc }: { mc: MindCache }) {
 *   const { text, yText, insertText } = useMindCacheDocument(mc, 'notes', '# My Notes');
 *
 *   // For simple display
 *   return <pre>{text}</pre>;
 *
 *   // For editor binding (e.g., y-quill)
 *   // const binding = new QuillBinding(yText, quillInstance);
 * }
 * ```
 */
export function useMindCacheDocument(
  mc: MindCache | null,
  key: string,
  initialText?: string
): UseMindCacheDocumentResult {
  const [text, setText] = useState('');
  const [yText, setYText] = useState<Y.Text | undefined>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!mc) {
      return;
    }

    // Create or get the document
    mc.set_document(key, initialText);
    const doc = mc.get_document(key);
    setYText(doc);
    setText(doc?.toString() || '');
    setIsReady(true);

    // Subscribe to changes
    if (doc) {
      const handler = () => {
        setText(doc.toString());
      };
      doc.observe(handler);

      return () => {
        doc.unobserve(handler);
      };
    }
  }, [mc, key, initialText]);

  const insertText = useCallback((index: number, newText: string) => {
    if (mc) {
      mc.insert_text(key, index, newText);
    }
  }, [mc, key]);

  const deleteText = useCallback((index: number, length: number) => {
    if (mc) {
      mc.delete_text(key, index, length);
    }
  }, [mc, key]);

  const replaceText = useCallback((newText: string) => {
    if (mc) {
      mc.set_value(key, newText);
    }
  }, [mc, key]);

  return {
    yText,
    text,
    isReady,
    insertText,
    deleteText,
    replaceText
  };
}
