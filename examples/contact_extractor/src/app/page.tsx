"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { MindCache } from 'mindcache';
import { Upload, User, Mail, Phone, Building, Briefcase, FileText, Trash2, Sparkles } from 'lucide-react';

// Contact type schema (matching our MindCache custom type)
const CONTACT_SCHEMA = `
#Contact
* name: full name of the contact
* email: email address
* phone: phone number
* company: company or organization
* role: job title or role
* notes: any additional notes
`;

interface Contact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
}

export default function Home() {
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState('');
  const mindCacheRef = useRef<MindCache | null>(null);

  // Initialize MindCache with Contact type
  useEffect(() => {
    const mc = new MindCache();
    mc.registerType('Contact', CONTACT_SCHEMA);
    mindCacheRef.current = mc;

    // Subscribe to all changes
    const unsubscribe = mc.subscribeToAll(() => {
      const newContacts = new Map<string, Contact>();
      for (const key of mc.keys()) {
        if (mc.getKeyType(key) === 'Contact') {
          const value = mc.get_value(key);
          if (value) {
            try {
              const parsed = typeof value === 'string' ? JSON.parse(value) : value;
              newContacts.set(key, parsed);
            } catch {
              // Skip invalid entries
            }
          }
        }
      }
      setContacts(newContacts);
    });

    return () => unsubscribe();
  }, []);

  const extractContacts = async (content: string) => {
    if (!content.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error('Extraction failed');

      const { contacts: extracted } = await response.json();
      const mc = mindCacheRef.current;
      if (!mc || !extracted?.length) return;

      // Add each extracted contact to MindCache
      for (const contact of extracted) {
        const key = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        mc.set_value(key, JSON.stringify(contact), { systemTags: ['LLMWrite'] });
        mc.setType(key, 'Contact');
      }

      setInputText('');
    } catch (error) {
      console.error('Failed to extract contacts:', error);
      alert('Failed to extract contacts. Make sure OPENAI_API_KEY is set.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const textFile = files.find(f => f.type.startsWith('text/') || f.name.endsWith('.txt') || f.name.endsWith('.md'));

    if (textFile) {
      const text = await textFile.text();
      extractContacts(text);
    } else if (e.dataTransfer.getData('text')) {
      extractContacts(e.dataTransfer.getData('text'));
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      setInputText(text);
    }
  }, []);

  const deleteContact = (key: string) => {
    mindCacheRef.current?.delete_key(key);
  };

  const clearAll = () => {
    const mc = mindCacheRef.current;
    if (!mc) return;
    for (const key of mc.keys()) {
      if (mc.getKeyType(key) === 'Contact') {
        mc.delete_key(key);
      }
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Drop Zone */}
      <div className="w-1/2 p-8 flex flex-col border-r border-[var(--border)]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-3 mb-2">
            <Sparkles className="w-7 h-7 text-indigo-400" />
            Contact Extractor
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Drop or paste any content to extract contacts using AI
          </p>
        </div>

        <div
          className={`drop-zone flex-1 rounded-xl flex flex-col items-center justify-center p-8 ${
            isDragOver ? 'drag-over' : ''
          } ${isProcessing ? 'processing' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isProcessing ? (
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">Extracting contacts...</p>
            </div>
          ) : (
            <>
              <Upload className="w-16 h-16 text-[var(--text-secondary)] mb-4" />
              <p className="text-lg mb-2">Drop files or paste content here</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Supports text files, emails, business cards, etc.
              </p>
            </>
          )}
        </div>

        <div className="mt-6">
          <textarea
            className="w-full h-32 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 text-sm resize-none focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Or paste/type content here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
          />
          <button
            onClick={() => extractContacts(inputText)}
            disabled={!inputText.trim() || isProcessing}
            className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Extract Contacts
          </button>
        </div>
      </div>

      {/* Right Panel - Contact Cards */}
      <div className="w-1/2 p-8 bg-[var(--bg-secondary)] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            Contacts
            <span className="ml-2 text-sm text-[var(--text-secondary)] font-normal">
              ({contacts.size})
            </span>
          </h2>
          {contacts.size > 0 && (
            <button
              onClick={clearAll}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pr-2">
          {contacts.size === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
              <div className="text-center">
                <User className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>No contacts yet</p>
                <p className="text-sm mt-1">Drop or paste content to extract contacts</p>
              </div>
            </div>
          ) : (
            Array.from(contacts.entries()).map(([key, contact]) => (
              <div key={key} className="contact-card rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{contact.name}</h3>
                      {contact.role && (
                        <p className="text-sm text-[var(--text-secondary)]">{contact.role}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteContact(key)}
                    className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Mail className="w-4 h-4" />
                      <a href={`mailto:${contact.email}`} className="hover:text-indigo-400 transition-colors">
                        {contact.email}
                      </a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Phone className="w-4 h-4" />
                      <a href={`tel:${contact.phone}`} className="hover:text-indigo-400 transition-colors">
                        {contact.phone}
                      </a>
                    </div>
                  )}
                  {contact.company && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Building className="w-4 h-4" />
                      <span>{contact.company}</span>
                    </div>
                  )}
                  {contact.notes && (
                    <div className="flex items-start gap-2 text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border)]">
                      <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span className="text-xs">{contact.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
