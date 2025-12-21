'use client';

import { useState, useRef, useEffect } from 'react';

interface EditableKeyNameProps {
  keyName: string;
  onSave: (newName: string) => void;
}

export function EditableKeyName({ keyName, onSave }: EditableKeyNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(keyName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(keyName);
  }, [keyName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== keyName) {
      onSave(trimmed);
    } else {
      setValue(keyName);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSave();
          }
          if (e.key === 'Escape') {
            setValue(keyName);
            setIsEditing(false);
          }
        }}
        className="font-mono text-blue-400 bg-transparent border-0 border-b border-zinc-500 focus:border-cyan-400 focus:outline-none focus:ring-0 pb-0.5"
      />
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer group"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <span className="font-mono text-blue-400">{keyName}</span>
      <svg
        className="w-3.5 h-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </div>
  );
}
