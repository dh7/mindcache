'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Instance, Permission, API_URL } from './types';
import { InstanceHeader, ActionButtons, TagFilter, KeyPropertiesPanel, EditableKeyName } from './components';
import ChatInterface from './components/ChatInterface';
import { MindCache, STMEntry as KeyEntry, STM as SyncData } from 'mindcache';

export default function InstanceEditorPage() {
  const params = useParams();
  const { getToken } = useAuth();
  const projectId = params.projectId as string;
  const instanceId = params.instanceId as string;

  const [instance, setInstance] = useState<Instance | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [keys, setKeys] = useState<SyncData>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>('read');

  // New key form
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyType, setNewKeyType] = useState<'text' | 'json' | 'image' | 'file' | 'document'>('text');

  // Track which keys have unsaved changes
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  // Track which key is currently being edited (has focus)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Track keys with pending saves (debounced)
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set());
  // Track keys that were recently saved (for visual feedback)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  // Track which key's properties panel is expanded (inline, not popup)
  const [expandedPropertiesKey, setExpandedPropertiesKey] = useState<string | null>(null);

  // Tag filtering
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSystemTags, setSelectedSystemTags] = useState<Array<'SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'protected' | 'ApplyTemplate'>>([]);
  const [showUntagged, setShowUntagged] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Chat panel resizing
  const [leftPanelWidth, setLeftPanelWidth] = useState(30); // 30% width for chat
  const [isResizing, setIsResizing] = useState(false);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) {
        return;
      }
      const container = document.querySelector('.resize-container');
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth))); // Clamp between 20% and 80%
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const mcRef = useRef<MindCache | null>(null);
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Fetch instance metadata from list endpoint
  useEffect(() => {
    const fetchInstance = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const found = data.instances?.find((i: Instance) => i.id === instanceId);
          if (found) {
            setInstance(found);
            setInstanceName(found.name);
          }
        }
      } catch (err) {
        console.error('Failed to fetch instance:', err);
      }
    };
    fetchInstance();
  }, [projectId, instanceId, getToken]);

  const handleUpdateInstanceName = async () => {
    if (!instanceName.trim() || instanceName === instance?.name) {
      setEditingName(false);
      return;
    }
    try {
      const token = await getToken() || 'dev';
      const res = await fetch(`${API_URL}/api/instances/${instanceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: instanceName })
      });
      if (res.ok) {
        const updated = await res.json();
        setInstance(prev => prev ? { ...prev, name: updated.name } : null);
        setInstanceName(updated.name);
      }
    } catch (err) {
      console.error('Failed to update instance name:', err);
    }
    setEditingName(false);
  };
  // Initialize MindCache SDK
  useEffect(() => {
    const initMindCache = async () => {
      if (mcRef.current) {
        return;
      }

      try {
        setError(null);
        const mc = new MindCache({
          cloud: {
            instanceId,
            baseUrl: API_URL,
            tokenProvider: async () => {
              const jwtToken = await getToken();
              const res = await fetch(`${API_URL}/api/ws-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
                },
                body: JSON.stringify({ instanceId })
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to get token' }));
                setError(err.details || err.error || 'Failed to authenticate');
                throw new Error('Failed to get token');
              }
              const { token, permission: perm } = await res.json();
              setPermission(perm);
              return token;
            }
          }
        });

        // Subscribe to all changes
        mc.subscribeToAll(() => {
          setConnected(mc.connectionState === 'connected');
          if (mc.connectionState === 'error') {
            setError('Connection error');
          } else if (mc.connectionState === 'connected') {
            setError(null);
          }
          // Update keys from MindCache, filtering incomplete entries
          const allKeys = mc.getAll();
          const filteredKeys: SyncData = {};
          for (const [key, entry] of Object.entries(allKeys)) {
            if (entry && entry.attributes) {
              filteredKeys[key] = entry;
            }
          }
          setKeys(filteredKeys);
        });

        mcRef.current = mc;
        setConnected(true);
      } catch (err) {
        console.error('Failed to initialize MindCache:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };

    initMindCache();

    return () => {
      mcRef.current?.disconnect();
      mcRef.current = null;
    };
  }, [instanceId, getToken]);

  // Helper to send updates via MindCache SDK
  const sendMessage = (msg: { type: string; key?: string; value?: unknown; attributes?: KeyEntry['attributes']; timestamp?: number }) => {
    if (!mcRef.current) {
      console.error('MindCache not initialized');
      return;
    }

    switch (msg.type) {
      case 'set':
        if (msg.key && msg.attributes) {
          // Check if this is an existing document type key
          const existingEntry = keys[msg.key];
          const isExistingDocument = existingEntry?.attributes?.type === 'document';

          if (msg.attributes.type === 'document' && !existingEntry) {
            // Creating a new document
            mcRef.current.set_document(msg.key, String(msg.value ?? ''));
          } else if (isExistingDocument) {
            // Updating an existing document - use set_attributes to not overwrite Y.Text
            mcRef.current.set_attributes(msg.key, msg.attributes);
          } else {
            // Non-document type
            mcRef.current.set_value(msg.key, msg.value, msg.attributes);
          }
        }
        break;
      case 'delete':
        if (msg.key) {
          mcRef.current.delete_key(msg.key);
        }
        break;
      case 'clear':
        mcRef.current.clear();
        break;
    }
  };

  const handleAddKey = () => {
    if (!newKeyName.trim() || !mcRef.current) {
      return;
    }

    // For document type, use set_document directly
    if (newKeyType === 'document') {
      mcRef.current.set_document(newKeyName, newKeyValue);
    } else {
      let value: unknown = newKeyValue;
      if (newKeyType === 'json') {
        try {
          value = JSON.parse(newKeyValue);
        } catch {
          alert('Invalid JSON');
          return;
        }
      }

      sendMessage({
        type: 'set',
        key: newKeyName,
        value,
        attributes: {
          readonly: false,
          visible: true,
          hardcoded: false,
          template: false,
          type: newKeyType,
          tags: [],
          contentTags: [],
          systemTags: [],
          zIndex: 0
        },
        timestamp: Date.now()
      });
    }

    setNewKeyName('');
    setNewKeyValue('');
    setShowAddKey(false);
  };

  // Sync keyValues when keys change from server
  // Only update values for keys that are NOT currently being edited
  useEffect(() => {
    setKeyValues(prev => {
      const updated = { ...prev };
      for (const [key, entry] of Object.entries(keys)) {
        if (entry.attributes.type === 'image' || entry.attributes.type === 'file') {
          // For images/files, don't set a text value
          continue;
        }
        const serverValue = entry.attributes.type === 'json'
          ? JSON.stringify(entry.value, null, 2)
          : String(entry.value ?? '');

        // Only update if this key is not currently being edited
        // OR if it's a new key we don't have yet
        if (key !== editingKey || !(key in prev)) {
          updated[key] = serverValue;
        }
      }
      return updated;
    });

    // Update available tags
    const allTags = new Set<string>();
    Object.values(keys).forEach(entry => {
      entry?.attributes?.tags?.forEach(tag => allTags.add(tag));
    });
    setAvailableTags(Array.from(allTags).sort());
  }, [keys, editingKey]);

  const handleKeyValueChange = (key: string, newValue: string) => {
    setKeyValues(prev => ({ ...prev, [key]: newValue }));

    const entry = keys[key];
    const isDocument = entry?.attributes?.type === 'document';

    // For document type, save immediately (real-time collab via Yjs)
    if (isDocument && mcRef.current) {
      mcRef.current.replace_document_text(key, newValue);
      return;
    }

    // For other types, debounce saves
    if (saveTimeoutRef.current[key]) {
      clearTimeout(saveTimeoutRef.current[key]);
    }

    // Mark as pending save
    setPendingSaves(prev => new Set(prev).add(key));
    // Remove from saved keys
    setSavedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    // Debounce save - auto-save after 1000ms of no typing
    saveTimeoutRef.current[key] = setTimeout(() => {
      saveKeyValue(key, newValue);
    }, 1000);
  };

  const saveKeyValue = (key: string, valueStr: string) => {
    const entry = keys[key];
    if (!entry) {
      return;
    }

    let value: unknown = valueStr;
    if (entry.attributes.type === 'json') {
      try {
        value = JSON.parse(valueStr);
      } catch {
        // Invalid JSON - don't save
        return;
      }
    }

    sendMessage({
      type: 'set',
      key,
      value,
      attributes: entry.attributes,
      timestamp: Date.now()
    });

    // Remove from pending and mark as saved
    setPendingSaves(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setSavedKeys(prev => new Set(prev).add(key));

    // Clear the saved indicator after 2 seconds
    setTimeout(() => {
      setSavedKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 2000);
  };

  // Manual save function
  const handleManualSave = (key: string) => {
    // Clear any pending debounce
    if (saveTimeoutRef.current[key]) {
      clearTimeout(saveTimeoutRef.current[key]);
    }
    saveKeyValue(key, keyValues[key] ?? '');
  };

  const handleDeleteKey = (key: string) => {
    if (!confirm(`Delete key "${key}"?`)) {
      return;
    }
    sendMessage({
      type: 'delete',
      key,
      timestamp: Date.now()
    });
    // Clean up local state
    setKeyValues(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Clear a key's value
  const handleClearValue = (key: string) => {
    const entry = keys[key];
    if (!entry) {
      return;
    }

    // Update local state
    setKeyValues(prev => ({ ...prev, [key]: '' }));

    // For document type, use replace_document_text for RT sync
    if (entry.attributes.type === 'document' && mcRef.current) {
      mcRef.current.replace_document_text(key, '');
    } else {
      // Send to server via sendMessage for other types
      sendMessage({
        type: 'set',
        key,
        value: '',
        attributes: entry.attributes,
        timestamp: Date.now()
      });
    }
  };

  // Toggle the properties panel for a key
  const togglePropertiesPanel = (key: string) => {
    setExpandedPropertiesKey(prev => prev === key ? null : key);
  };

  // Save attributes from the inline KeyPropertiesPanel component
  const handleSaveAttributes = (oldKey: string, newKeyName: string, attributes: KeyEntry['attributes']) => {
    const currentEntry = keys[oldKey];
    if (!currentEntry || !mcRef.current) {
      return;
    }

    if (newKeyName && newKeyName !== oldKey) {
      // Key is being renamed
      if (keys[newKeyName] || newKeyName.startsWith('$')) {
        alert(`Key "${newKeyName}" already exists or is a system key`);
        return;
      }

      const isDocument = currentEntry.attributes?.type === 'document';

      if (isDocument) {
        // For documents, get the text content and create new document
        const textContent = mcRef.current.get_document_text(oldKey) || '';
        mcRef.current.set_document(newKeyName, textContent, attributes);
      } else {
        // Create new key with updated attributes
        sendMessage({
          type: 'set',
          key: newKeyName,
          value: currentEntry.value,
          attributes,
          timestamp: Date.now()
        });
      }

      // Delete old key
      sendMessage({
        type: 'delete',
        key: oldKey,
        timestamp: Date.now()
      });

      // Update expanded key to new name
      setExpandedPropertiesKey(newKeyName);
    } else {
      // Just update attributes
      sendMessage({
        type: 'set',
        key: oldKey,
        value: currentEntry.value,
        attributes,
        timestamp: Date.now()
      });
    }
  };

  const handleFileUpload = async (key: string, file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const dataUrl = base64;

        sendMessage({
          type: 'set',
          key,
          value: dataUrl,
          attributes: {
            ...keys[key]?.attributes || {
              readonly: false,
              visible: true,
              hardcoded: false,
              template: false,
              type: file.type.startsWith('image/') ? 'image' : 'file',
              tags: [],
              zIndex: 0
            },
            type: file.type.startsWith('image/') ? 'image' : 'file',
            contentType: file.type
          },
          timestamp: Date.now()
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    }
  };

  const handleExportJSON = () => {
    const exportData: Record<string, { value: unknown; attributes: KeyEntry['attributes'] }> = {};
    Object.entries(keys).forEach(([key, entry]) => {
      exportData[key] = {
        value: entry.value,
        attributes: entry.attributes
      };
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcache-export-${instanceId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const now = new Date();
    const lines: string[] = [];
    const appendixEntries: Array<{
      key: string;
      type: string;
      contentType: string;
      base64: string;
      label: string;
    }> = [];
    let appendixCounter = 0;

    lines.push('# MindCache STM Export');
    lines.push('');
    lines.push(`Export Date: ${now.toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## STM Entries');
    lines.push('');

    sortedKeys.forEach(([key, entry]) => {
      if (entry.attributes.hardcoded) {
        return;
      }

      lines.push(`### ${key}`);
      const entryType = entry.attributes.type || 'text';
      lines.push(`- **Type**: \`${entryType}\``);
      lines.push(`- **Readonly**: \`${entry.attributes.readonly}\``);
      lines.push(`- **Visible**: \`${entry.attributes.visible}\``);
      lines.push(`- **Template**: \`${entry.attributes.template}\``);
      lines.push(`- **Z-Index**: \`${entry.attributes.zIndex ?? 0}\``);

      if (entry.attributes.tags && entry.attributes.tags.length > 0) {
        lines.push(`- **Tags**: \`${entry.attributes.tags.join('`, `')}\``);
      }

      if (entry.attributes.contentType) {
        lines.push(`- **Content Type**: \`${entry.attributes.contentType}\``);
      }

      if (entryType === 'image' || entryType === 'file') {
        const label = String.fromCharCode(65 + appendixCounter);
        appendixCounter++;
        lines.push(`- **Value**: [See Appendix ${label}]`);

        appendixEntries.push({
          key,
          type: entryType,
          contentType: entry.attributes.contentType || 'application/octet-stream',
          base64: typeof entry.value === 'string' ? entry.value : '',
          label
        });
      } else if (entryType === 'json') {
        lines.push('- **Value**:');
        lines.push('```json');
        try {
          const jsonValue = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2);
          lines.push(jsonValue);
        } catch {
          lines.push(String(entry.value));
        }
        lines.push('```');
      } else {
        const valueStr = String(entry.value);
        lines.push('- **Value**:');
        lines.push('```');
        lines.push(valueStr);
        lines.push('```');
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    });

    if (appendixEntries.length > 0) {
      lines.push('## Appendix: Binary Data');
      lines.push('');

      appendixEntries.forEach(({ key, contentType, base64, label }) => {
        lines.push(`### Appendix ${label}: ${key}`);
        lines.push(`**Type**: ${contentType}`);
        lines.push('');
        lines.push('```');
        lines.push(base64);
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    lines.push('*End of MindCache Export*');

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcache-export-${instanceId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const importData = JSON.parse(text);

        for (const [key, data] of Object.entries(importData)) {
          const entry = data as { value: unknown; attributes: KeyEntry['attributes'] };
          sendMessage({
            type: 'set',
            key,
            value: entry.value,
            attributes: {
              readonly: entry.attributes.readonly ?? false,
              visible: entry.attributes.visible ?? true,
              hardcoded: entry.attributes.hardcoded ?? false,
              template: entry.attributes.template ?? false,
              type: entry.attributes.type || 'text',
              contentType: entry.attributes.contentType,
              tags: entry.attributes.tags || [],
              contentTags: entry.attributes.contentTags || [],
              systemTags: entry.attributes.systemTags || [],
              zIndex: entry.attributes.zIndex ?? 0
            },
            timestamp: Date.now()
          });
        }

        alert(`Imported ${Object.keys(importData).length} keys successfully`);
      } catch (error) {
        console.error('Failed to import:', error);
        alert('Failed to import file. Please check the format.');
      }
    };
    input.click();
  };

  const handleImportMarkdown = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,text/markdown';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }

      try {
        const markdown = await file.text();
        const lines = markdown.split('\n');
        let currentSection: 'header' | 'entries' | 'appendix' = 'header';
        let currentKey: string | null = null;
        let currentEntry: Partial<KeyEntry> | null = null;
        let inCodeBlock = false;
        let codeBlockContent: string[] = [];
        let codeBlockType: 'value' | 'json' | 'base64' | null = null;
        const appendixData: Record<string, { contentType: string; base64: string }> = {};
        let currentAppendixKey: string | null = null;
        const pendingEntries: Record<string, Partial<KeyEntry> & { appendixLabel?: string }> = {};

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          if (trimmed === '## STM Entries') {
            currentSection = 'entries';
            continue;
          }
          if (trimmed === '## Appendix: Binary Data') {
            currentSection = 'appendix';
            continue;
          }

          if (trimmed === '```' || trimmed === '```json') {
            if (!inCodeBlock) {
              inCodeBlock = true;
              codeBlockContent = [];
              codeBlockType = currentSection === 'appendix' ? 'base64' : (trimmed === '```json' ? 'json' : 'value');
            } else {
              inCodeBlock = false;
              const content = codeBlockContent.join('\n');

              if (currentSection === 'appendix' && currentAppendixKey) {
                appendixData[currentAppendixKey].base64 = content;
              } else if (currentEntry && codeBlockType === 'json') {
                currentEntry.value = content;
              } else if (currentEntry && codeBlockType === 'value') {
                currentEntry.value = content;
              }

              codeBlockContent = [];
              codeBlockType = null;
            }
            continue;
          }

          if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
          }

          if (currentSection === 'entries') {
            if (trimmed.startsWith('### ')) {
              if (currentKey && currentEntry && currentEntry.attributes) {
                pendingEntries[currentKey] = currentEntry as KeyEntry & { appendixLabel?: string };
              }

              currentKey = trimmed.substring(4);
              currentEntry = {
                value: undefined,
                attributes: {
                  readonly: false,
                  visible: true,
                  hardcoded: false,
                  template: false,
                  type: 'text',
                  tags: [],
                  contentTags: [],
                  systemTags: [],
                  zIndex: 0
                }
              };
            } else if (trimmed.startsWith('- **Type**: `')) {
              const type = trimmed.match(/`([^`]+)`/)?.[1] as KeyEntry['attributes']['type'];
              if (currentEntry && type) {
                currentEntry.attributes!.type = type;
              }
            } else if (trimmed.startsWith('- **Readonly**: `')) {
              const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
              if (currentEntry) {
                currentEntry.attributes!.readonly = value;
              }
            } else if (trimmed.startsWith('- **Visible**: `')) {
              const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
              if (currentEntry) {
                currentEntry.attributes!.visible = value;
              }
            } else if (trimmed.startsWith('- **Template**: `')) {
              const value = trimmed.match(/`([^`]+)`/)?.[1] === 'true';
              if (currentEntry) {
                currentEntry.attributes!.template = value;
              }
            } else if (trimmed.startsWith('- **Z-Index**: `')) {
              const zIndexStr = trimmed.match(/`([^`]+)`/)?.[1];
              if (currentEntry && zIndexStr) {
                const zIndex = parseInt(zIndexStr, 10);
                if (!isNaN(zIndex)) {
                  currentEntry.attributes!.zIndex = zIndex;
                }
              }
            } else if (trimmed.startsWith('- **Tags**: `')) {
              const tagsStr = trimmed.substring(13, trimmed.length - 1);
              if (currentEntry) {
                currentEntry.attributes!.tags = tagsStr.split('`, `');
              }
            } else if (trimmed.startsWith('- **Content Type**: `')) {
              const contentType = trimmed.match(/`([^`]+)`/)?.[1];
              if (currentEntry && contentType) {
                currentEntry.attributes!.contentType = contentType;
              }
            } else if (trimmed.startsWith('- **Value**: [See Appendix ')) {
              const labelMatch = trimmed.match(/Appendix ([A-Z])\]/);
              if (currentEntry && labelMatch && currentKey) {
                (currentEntry as any).appendixLabel = labelMatch[1];
                currentEntry.value = '';
              }
            }
          }

          if (currentSection === 'appendix') {
            if (trimmed.startsWith('### Appendix ')) {
              const match = trimmed.match(/### Appendix ([A-Z]): (.+)/);
              if (match) {
                const label = match[1];
                const key = match[2];
                currentAppendixKey = `${label}:${key}`;
                appendixData[currentAppendixKey] = { contentType: '', base64: '' };
              }
            } else if (trimmed.startsWith('**Type**: ')) {
              const contentType = trimmed.substring(10);
              if (currentAppendixKey) {
                appendixData[currentAppendixKey].contentType = contentType;
              }
            }
          }
        }

        if (currentKey && currentEntry && currentEntry.attributes) {
          pendingEntries[currentKey] = currentEntry as KeyEntry & { appendixLabel?: string };
        }

        Object.entries(pendingEntries).forEach(([key, entry]) => {
          const appendixLabel = (entry as any).appendixLabel;
          if (appendixLabel) {
            const appendixKey = `${appendixLabel}:${key}`;
            const appendixInfo = appendixData[appendixKey];
            if (appendixInfo && appendixInfo.base64) {
              entry.value = appendixInfo.base64;
              if (!entry.attributes!.contentType && appendixInfo.contentType) {
                entry.attributes!.contentType = appendixInfo.contentType;
              }
            }
          }

          if (entry.value !== undefined && entry.attributes) {
            sendMessage({
              type: 'set',
              key,
              value: entry.value,
              attributes: {
                readonly: entry.attributes.readonly ?? false,
                visible: entry.attributes.visible ?? true,
                hardcoded: entry.attributes.hardcoded ?? false,
                template: entry.attributes.template ?? false,
                type: entry.attributes.type || 'text',
                contentType: entry.attributes.contentType,
                tags: entry.attributes.tags || [],
                contentTags: entry.attributes.contentTags || [],
                systemTags: entry.attributes.systemTags || [],
                zIndex: entry.attributes.zIndex ?? 0
              },
              timestamp: Date.now()
            });
          }
        });

        alert(`Imported ${Object.keys(pendingEntries).length} keys successfully`);
      } catch (error) {
        console.error('Failed to import:', error);
        alert('Failed to import file. Please check the format.');
      }
    };
    input.click();
  };

  const getDataUrl = (key: string): string | null => {
    const entry = keys[key];
    if (!entry || entry.attributes.type !== 'image') {
      return null;
    }
    if (typeof entry.value === 'string' && entry.value.startsWith('data:')) {
      return entry.value;
    }
    return null;
  };

  const canEdit = permission === 'write' || permission === 'admin' || permission === 'system';

  // Sort keys by zIndex (ascending), then by name
  const sortedKeys = Object.entries(keys).sort(([keyA, entryA], [keyB, entryB]) => {
    const zIndexA = entryA.attributes.zIndex ?? 0;
    const zIndexB = entryB.attributes.zIndex ?? 0;
    if (zIndexA !== zIndexB) {
      return zIndexA - zIndexB;
    }
    return keyA.localeCompare(keyB);
  });

  // Filter by selected tags - untagged is non-exclusive and can be combined with tag filters
  const filteredKeys = (() => {
    // Default: show all keys when nothing is selected
    if (!showUntagged && selectedTags.length === 0 && selectedSystemTags.length === 0) {
      return sortedKeys;
    }

    return sortedKeys.filter(([_key, entry]) => {
      const keyTags = entry.attributes.tags || [];
      const keySystemTags = entry.attributes.systemTags || [];

      // System tag filter: must have ALL selected system tags
      if (selectedSystemTags.length > 0) {
        const hasAllSystemTags = selectedSystemTags.every(st => {
          // Check new systemTags array first
          if (keySystemTags.includes(st)) {
            return true;
          }

          // Strict matching: only check for exact systemTags
          if (st === 'SystemPrompt') {
            return keySystemTags.includes('SystemPrompt') || keySystemTags.includes('prompt');
          }
          if (st === 'LLMRead') {
            return keySystemTags.includes('LLMRead');
          }
          if (st === 'LLMWrite') {
            return keySystemTags.includes('LLMWrite');
          }
          if (st === 'protected') {
            return _key === '$Date' || _key === '$TIME';
          }
          if (st === 'ApplyTemplate') {
            return keySystemTags.includes('ApplyTemplate') || keySystemTags.includes('template');
          }
          return false;
        });
        if (!hasAllSystemTags) {
          return false;
        }
      }

      // Content tag filter
      if (!showUntagged && selectedTags.length === 0) {
        return true; // No content tag filter active
      }

      const hasNoTags = keyTags.length === 0;
      const hasSelectedTag = selectedTags.length > 0 && selectedTags.some(st => keyTags.includes(st));

      if (showUntagged && selectedTags.length > 0) {
        return hasNoTags || hasSelectedTag;
      } else if (showUntagged) {
        return hasNoTags;
      } else {
        return hasSelectedTag;
      }
    });
  })();

  return (
    <div className="h-screen flex overflow-hidden resize-container bg-zinc-950">
      {/* Left Panel - Chat */}
      <div style={{ width: `${leftPanelWidth}%` }} className="flex flex-col min-h-0 p-4 border-r border-zinc-800">
        <ChatInterface instanceId={instanceId} mode="use" />
      </div>

      {/* Resizer */}
      <div
        className={`w-1 bg-transparent hover:bg-cyan-400 hover:bg-opacity-30 cursor-col-resize transition-colors flex-shrink-0 ${isResizing ? 'bg-cyan-400 bg-opacity-50' : ''}`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Right Panel - Existing Content */}
      <div style={{ width: `${100 - leftPanelWidth}%` }} className="flex flex-col min-h-0 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto w-full">
          <InstanceHeader
            instance={instance}
            instanceName={instanceName}
            editingName={editingName}
            canEdit={canEdit}
            connected={connected}
            permission={permission}
            error={error}
            onNameChange={setInstanceName}
            onStartEdit={() => setEditingName(true)}
            onCancelEdit={() => {
              setInstanceName(instance?.name || '');
              setEditingName(false);
            }}
            onSaveName={handleUpdateInstanceName}
          />

          {canEdit && (
            <ActionButtons
              onAddKey={() => setShowAddKey(true)}
              onExportJSON={handleExportJSON}
              onImportJSON={handleImportJSON}
              onExportMarkdown={handleExportMarkdown}
              onImportMarkdown={handleImportMarkdown}
            />
          )}

          <TagFilter
            availableTags={availableTags}
            selectedTags={selectedTags}
            selectedSystemTags={selectedSystemTags}
            showUntagged={showUntagged}
            onToggleTag={(tag) => {
              setSelectedTags(prev =>
                prev.includes(tag)
                  ? prev.filter(t => t !== tag)
                  : [...prev, tag]
              );
            }}
            onToggleSystemTag={(tag) => {
              setSelectedSystemTags(prev =>
                prev.includes(tag)
                  ? prev.filter(t => t !== tag)
                  : [...prev, tag]
              );
            }}
            onToggleUntagged={() => setShowUntagged(!showUntagged)}
            onClearFilters={() => {
              setSelectedTags([]);
              setSelectedSystemTags([]);
              setShowUntagged(false);
            }}
          />

          {/* Keys List */}
          <div className="space-y-3">
            {filteredKeys.length === 0 ? (
              <div className="text-zinc-500 text-center py-8 border border-zinc-800 rounded-lg">
                {Object.keys(keys).length === 0
                  ? `No keys yet. ${canEdit ? 'Add one to get started.' : ''}`
                  : (selectedTags.length > 0 || selectedSystemTags.length > 0)
                    ? 'No keys match the selected filters.'
                    : 'No keys to display.'}
              </div>
            ) : (
              filteredKeys.map(([key, entry]) => {
                const isEmpty = !entry.value || (typeof entry.value === 'string' && entry.value.trim() === '');
                const contentType = entry.attributes.type || 'text';
                const dataUrl = getDataUrl(key);

                let displayValue = '';
                if (isEmpty) {
                  displayValue = '_______';
                } else if (contentType === 'image') {
                  displayValue = `[IMAGE: ${entry.attributes.contentType || 'unknown'}]`;
                } else if (contentType === 'file') {
                  displayValue = `[FILE: ${entry.attributes.contentType || 'unknown'}]`;
                } else if (contentType === 'json') {
                  try {
                    displayValue = typeof entry.value === 'string'
                      ? JSON.stringify(JSON.parse(entry.value), null, 2)
                      : JSON.stringify(entry.value, null, 2);
                  } catch {
                    displayValue = String(entry.value);
                  }
                } else {
                  displayValue = typeof entry.value === 'object'
                    ? JSON.stringify(entry.value, null, 2)
                    : String(entry.value);
                }

                const indicators = [];
                if (contentType !== 'text') {
                  indicators.push(contentType.toUpperCase().charAt(0));
                }
                // Show system tags: SystemPrompt, LLMRead, LLMWrite, ApplyTemplate, Protected
                const systemTags = entry.attributes.systemTags || [];

                // SP: Only SystemPrompt tag
                if (systemTags.includes('SystemPrompt') || systemTags.includes('prompt')) {
                  indicators.push('SP');
                }

                // LR: Only LLMRead tag
                if (systemTags.includes('LLMRead')) {
                  indicators.push('LR');
                }

                // LW: Only LLMWrite tag
                if (systemTags.includes('LLMWrite')) {
                  indicators.push('LW');
                }

                // AT: ApplyTemplate
                if (systemTags.includes('ApplyTemplate') || systemTags.includes('template')) {
                  indicators.push('AT');
                }

                // P: Only $Date and $TIME
                if (key === '$Date' || key === '$TIME') {
                  indicators.push('P');
                }

                return (
                  <div
                    key={key}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4"
                  >
                    <div
                      className="flex justify-between items-start cursor-pointer"
                      onClick={(e) => {
                        // Toggle expand/collapse if click is not on an interactive element
                        if (canEdit) {
                          const target = e.target as HTMLElement;
                          // Don't toggle if clicking on buttons or inputs
                          if (!target.closest('button') && !target.closest('input') && !target.closest('textarea')) {
                            togglePropertiesPanel(key);
                          }
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Key name - when expanded: text + pen icon, click to edit with underline */}
                        {expandedPropertiesKey === key && canEdit ? (
                          <EditableKeyName
                            keyName={key}
                            onSave={(newName) => {
                              if (newName && newName !== key) {
                                handleSaveAttributes(key, newName, entry.attributes);
                              }
                            }}
                          />
                        ) : (
                          <span className="font-mono text-blue-400">{key}</span>
                        )}
                        {/* Only show indicators and tags when NOT expanded */}
                        {expandedPropertiesKey !== key && (
                          <>
                            {indicators.length > 0 && (
                              <span className="text-xs text-yellow-400">
                                [{indicators.join('')}]
                              </span>
                            )}
                            {entry.attributes.tags && entry.attributes.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {entry.attributes.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 text-xs bg-cyan-900 bg-opacity-50 text-cyan-300 rounded font-mono border border-cyan-600"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {entry.attributes.zIndex !== undefined && entry.attributes.zIndex !== 0 && (
                              <span className="text-xs text-zinc-500">
                                z:{entry.attributes.zIndex}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePropertiesPanel(key);
                            }}
                            className={`text-sm leading-none px-1 transition-colors ${expandedPropertiesKey === key
                              ? 'text-cyan-400'
                              : 'text-cyan-600 hover:text-yellow-400'
                            }`}
                            title={expandedPropertiesKey === key ? 'Collapse Properties' : 'Edit Properties'}
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${expandedPropertiesKey === key ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteKey(key);
                            }}
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Only show value display when NOT expanded (value is in panel when expanded) */}
                    {expandedPropertiesKey !== key && (
                      <>
                        {contentType === 'image' && dataUrl ? (
                          <div className="mt-2">
                            <img
                              src={dataUrl}
                              alt={`Preview of ${key}`}
                              className="max-w-full h-auto border border-zinc-700 rounded"
                              style={{ maxHeight: '300px' }}
                            />
                            {canEdit && (
                              <button
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'image/*';
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleFileUpload(key, file);
                                    }
                                  };
                                  input.click();
                                }}
                                className="mt-2 px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
                              >
                                Replace Image
                              </button>
                            )}
                          </div>
                        ) : contentType === 'file' ? (
                          <div className="mt-2">
                            <div className="text-xs text-zinc-400">
                              {entry.attributes.contentType || 'File'}
                            </div>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleFileUpload(key, file);
                                    }
                                  };
                                  input.click();
                                }}
                                className="mt-2 px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
                              >
                                Replace File
                              </button>
                            )}
                          </div>
                        ) : canEdit ? (
                          <>
                            <textarea
                              className="w-full p-2 bg-black border border-zinc-700 rounded font-mono text-xs text-zinc-300 focus:border-cyan-600 outline-none resize-y transition-colors"
                              rows={contentType === 'json' ? 6 : 2}
                              value={keyValues[key] ?? ''}
                              onChange={(e) => handleKeyValueChange(key, e.target.value)}
                              onFocus={() => setEditingKey(key)}
                              onBlur={() => {
                                // Delay clearing to allow real-time sync to respect our edit
                                setTimeout(() => setEditingKey(null), 100);
                              }}
                              placeholder="Enter value..."
                            />
                            {/* For document type, show "Real-time sync" instead of save status */}
                            {contentType === 'document' ? (
                              <div className="text-xs text-green-400 mt-1 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                Real-time sync
                              </div>
                            ) : (pendingSaves.has(key) || savedKeys.has(key) || editingKey === key) && (
                              <div className="flex items-center justify-end gap-2 text-xs mt-1">
                                {pendingSaves.has(key) && (
                                  <span className="text-amber-400 flex items-center gap-1">
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Saving...
                                  </span>
                                )}
                                {savedKeys.has(key) && !pendingSaves.has(key) && (
                                  <span className="text-green-400 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Saved
                                  </span>
                                )}
                                {!savedKeys.has(key) && !pendingSaves.has(key) && editingKey === key && (
                                  <button
                                    onClick={() => handleManualSave(key)}
                                    className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs transition-colors"
                                  >
                                    Save
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <pre className="text-xs font-mono text-zinc-300 bg-black p-2 rounded overflow-x-auto">
                            {displayValue}
                          </pre>
                        )}
                      </>
                    )}

                    {/* Inline Properties Panel */}
                    <KeyPropertiesPanel
                      keyName={key}
                      entry={entry}
                      availableTags={availableTags}
                      isExpanded={expandedPropertiesKey === key}
                      onToggle={() => togglePropertiesPanel(key)}
                      onSave={(newKeyName, attributes) => handleSaveAttributes(key, newKeyName, attributes)}
                      onFileUpload={handleFileUpload}
                      onValueChange={handleKeyValueChange}
                      onClearValue={handleClearValue}
                      currentValue={
                        entry.attributes.type === 'image' || entry.attributes.type === 'file'
                          ? String(entry.value ?? '')
                          : keyValues[key] ?? ''
                      }
                      canEdit={canEdit}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Add Key Modal */}
          {showAddKey && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
                <h3 className="text-lg mb-4">Add New Key</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Key Name</label>
                    <input
                      type="text"
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="my_key"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                      value={newKeyType}
                      onChange={(e) => setNewKeyType(e.target.value as 'text' | 'json' | 'image' | 'file' | 'document')}
                    >
                      <option value="text">Text</option>
                      <option value="json">JSON</option>
                      <option value="document">Document (Real-time)</option>
                      <option value="image">Image</option>
                      <option value="file">File</option>
                    </select>
                  </div>
                  {(newKeyType === 'text' || newKeyType === 'json' || newKeyType === 'document') && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Value</label>
                      <textarea
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded font-mono text-xs"
                        rows={4}
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder={newKeyType === 'json' ? '{ "key": "value" }' : 'Enter value...'}
                      />
                    </div>
                  )}
                  {(newKeyType === 'image' || newKeyType === 'file') && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = newKeyType === 'image' ? 'image/*' : '*/*';
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file && newKeyName.trim()) {
                              await handleFileUpload(newKeyName.trim(), file);
                              setNewKeyName('');
                              setNewKeyValue('');
                              setShowAddKey(false);
                            }
                          };
                          input.click();
                        }}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm"
                      >
                        Upload {newKeyType === 'image' ? 'Image' : 'File'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowAddKey(false)}
                    className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-500 text-sm"
                  >
                    Cancel
                  </button>
                  {(newKeyType === 'text' || newKeyType === 'json' || newKeyType === 'document') && (
                    <button
                      onClick={handleAddKey}
                      className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 text-sm"
                      disabled={!newKeyName.trim()}
                    >
                      Add Key
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
