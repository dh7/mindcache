'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function AboutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        margin: 0,
        padding: '1rem'
      }}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full relative shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="about-title" className="text-xl font-semibold text-white">About MindCache</h2>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            type="button"
            className="text-zinc-400 hover:text-white transition p-1 -mr-1 -mt-1 cursor-pointer"
            aria-label="Close"
            style={{ pointerEvents: 'auto' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 text-sm text-zinc-300">
          <div>
            <span className="text-zinc-500">Version:</span>{' '}
            <span className="font-mono">{process.env.NEXT_PUBLIC_APP_VERSION || '0.0.1'}</span>
          </div>
          <div>
            <span className="text-zinc-500">Commit:</span>{' '}
            <span className="font-mono text-xs">
              {process.env.NEXT_PUBLIC_GIT_COMMIT || 'unknown'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Build Date:</span>{' '}
            <span className="font-mono text-xs">
              {process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString().split('T')[0]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level, avoiding any stacking context issues
  return createPortal(modalContent, document.body);
}
