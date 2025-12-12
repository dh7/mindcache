'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

interface Instance {
  id: string;
  name: string;
  is_readonly: number;
}

interface KeyEntry {
  value: unknown;
  attributes: {
    readonly: boolean;
    visible: boolean;
    hardcoded: boolean;
    template: boolean;
    type: 'text' | 'image' | 'file' | 'json';
    contentType?: string;
    tags?: string[];
    zIndex?: number;
  };
  updatedAt?: number;
}

type SyncData = Record<string, KeyEntry>;

// Use WSS for production, WS for localhost
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');

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
  const [permission, setPermission] = useState<'read' | 'write' | 'admin' | 'system'>('read');

  // New key form
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyType, setNewKeyType] = useState<'text' | 'json'>('text');

  // Track which keys have unsaved changes
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});

  // Attributes editor popup
  const [editingAttributes, setEditingAttributes] = useState<string | null>(null);
  const [editingKeyName, setEditingKeyName] = useState('');
  const [attributesForm, setAttributesForm] = useState({
    readonly: false,
    visible: true,
    hardcoded: false,
    template: false,
    type: 'text' as 'text' | 'image' | 'file' | 'json',
    contentType: '',
    tags: [] as string[],
    zIndex: 0
  });
  const [newTagInput, setNewTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [zIndexInput, setZIndexInput] = useState<string>('0');

  // Tag filtering
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showUntagged, setShowUntagged] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
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

  const connect = useCallback(async () => {
    try {
      // Get short-lived WS token from API
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
        return;
      }

      const { token: wsToken, permission: perm } = await res.json();

      // Connect with token in URL (server validates before upgrade)
      const ws = new WebSocket(`${WS_URL}/sync/${instanceId}?token=${wsToken}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Auth already verified by server, wait for sync message
        setConnected(true);
        setPermission(perm);
        setError(null);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log('Received message:', msg);

        switch (msg.type) {
          case 'sync':
            setKeys(msg.data || {});
            break;
          case 'key_updated':
            setKeys(prev => ({
              ...prev,
              [msg.key]: {
                value: msg.value,
                attributes: msg.attributes,
                updatedAt: msg.timestamp
              }
            }));
            break;
          case 'key_deleted':
            setKeys(prev => {
              const next = { ...prev };
              delete next[msg.key];
              return next;
            });
            break;
          case 'cleared':
            setKeys({});
            break;
          case 'error':
            console.error('Server error:', msg.error);
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
      };

      ws.onerror = () => {
        setError('Connection error');
      };
    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [instanceId, getToken]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = (msg: object) => {
    console.log('Sending message:', msg, 'WebSocket state:', wsRef.current?.readyState);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      console.log('Message sent successfully');
    } else {
      console.error('WebSocket not open, cannot send');
    }
  };

  const handleAddKey = () => {
    if (!newKeyName.trim()) {
      return;
    }

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
        tags: []
      },
      timestamp: Date.now()
    });

    setNewKeyName('');
    setNewKeyValue('');
    setShowAddKey(false);
  };

  // Initialize keyValues when keys change from server
  useEffect(() => {
    const newKeyValues: Record<string, string> = {};
    for (const [key, entry] of Object.entries(keys)) {
      if (!(key in keyValues)) {
        if (entry.attributes.type === 'image' || entry.attributes.type === 'file') {
          // For images/files, don't set a text value
          continue;
        }
        newKeyValues[key] = entry.attributes.type === 'json'
          ? JSON.stringify(entry.value, null, 2)
          : String(entry.value ?? '');
      }
    }
    if (Object.keys(newKeyValues).length > 0) {
      setKeyValues(prev => ({ ...prev, ...newKeyValues }));
    }

    // Update available tags
    const allTags = new Set<string>();
    Object.values(keys).forEach(entry => {
      entry.attributes.tags?.forEach(tag => allTags.add(tag));
    });
    setAvailableTags(Array.from(allTags).sort());
  }, [keys]);

  const handleKeyValueChange = (key: string, newValue: string) => {
    setKeyValues(prev => ({ ...prev, [key]: newValue }));

    // Clear existing timeout for this key
    if (saveTimeoutRef.current[key]) {
      clearTimeout(saveTimeoutRef.current[key]);
    }

    // Debounce save - auto-save after 500ms of no typing
    saveTimeoutRef.current[key] = setTimeout(() => {
      saveKeyValue(key, newValue);
    }, 500);
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

  const startEditingAttributes = (key: string) => {
    const entry = keys[key];
    if (!entry) {
      return;
    }

    const zIndex = entry.attributes.zIndex ?? 0;
    setAttributesForm({
      readonly: entry.attributes.readonly,
      visible: entry.attributes.visible,
      hardcoded: entry.attributes.hardcoded,
      template: entry.attributes.template,
      type: entry.attributes.type,
      contentType: entry.attributes.contentType || '',
      tags: entry.attributes.tags || [],
      zIndex: zIndex
    });
    setZIndexInput(String(zIndex));
    setEditingAttributes(key);
    setEditingKeyName(key);
    setNewTagInput('');
  };

  const saveAttributes = () => {
    if (!editingAttributes) {
      return;
    }

    const oldKey = editingAttributes;
    const newKey = editingKeyName.trim();

    // Parse z-index from input string
    const zIndexValue = parseFloat(zIndexInput);
    const finalZIndex = isNaN(zIndexValue) ? 0 : zIndexValue;

    const finalTags = [...attributesForm.tags];
    const pendingTag = newTagInput.trim();
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }

    if (newKey && newKey !== oldKey) {
      if (keys[newKey] || newKey.startsWith('$')) {
        alert(`Key "${newKey}" already exists or is a system key`);
        return;
      }

      const currentEntry = keys[oldKey];
      if (!currentEntry) {
        return;
      }

      sendMessage({
        type: 'set',
        key: newKey,
        value: currentEntry.value,
        attributes: {
          ...attributesForm,
          tags: finalTags,
          zIndex: finalZIndex
        },
        timestamp: Date.now()
      });

      sendMessage({
        type: 'delete',
        key: oldKey,
        timestamp: Date.now()
      });
    } else {
      const currentEntry = keys[oldKey];
      if (!currentEntry) {
        return;
      }

      sendMessage({
        type: 'set',
        key: oldKey,
        value: currentEntry.value,
        attributes: {
          ...attributesForm,
          tags: finalTags,
          zIndex: finalZIndex
        },
        timestamp: Date.now()
      });
    }

    setEditingAttributes(null);
    setEditingKeyName('');
    setNewTagInput('');
    setTagSuggestions([]);
    setZIndexInput('0');
  };

  const cancelAttributes = () => {
    setEditingAttributes(null);
    setEditingKeyName('');
    setNewTagInput('');
    setTagSuggestions([]);
    setZIndexInput('0');
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !attributesForm.tags.includes(trimmedTag)) {
      setAttributesForm({
        ...attributesForm,
        tags: [...attributesForm.tags, trimmedTag]
      });
    }
  };

  const removeTag = (tagToRemove: string) => {
    setAttributesForm({
      ...attributesForm,
      tags: attributesForm.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleTagInputChange = (value: string) => {
    setNewTagInput(value);

    if (value.trim()) {
      const filtered = availableTags.filter(tag =>
        tag.toLowerCase().includes(value.toLowerCase()) &&
        !attributesForm.tags.includes(tag)
      );
      setTagSuggestions(filtered);
    } else {
      setTagSuggestions([]);
    }
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (newTagInput.trim()) {
        addTag(newTagInput);
        setNewTagInput('');
        setTagSuggestions([]);
      }
    } else if (e.key === 'Backspace' && newTagInput === '' && attributesForm.tags.length > 0) {
      const lastTag = attributesForm.tags[attributesForm.tags.length - 1];
      removeTag(lastTag);
    } else if (e.key === 'Escape') {
      setTagSuggestions([]);
    }
  };

  const addTagFromSuggestion = (tag: string) => {
    addTag(tag);
    setNewTagInput('');
    setTagSuggestions([]);
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
                const zIndex = parseFloat(zIndexStr);
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
    if (!showUntagged && selectedTags.length === 0) {
      return sortedKeys;
    }

    // Show keys that match: either have no tags (if untagged selected) OR have at least one selected tag
    return sortedKeys.filter(([_key, entry]) => {
      const keyTags = entry.attributes.tags || [];
      const hasNoTags = keyTags.length === 0;
      const hasSelectedTag = selectedTags.length > 0 && selectedTags.some(selectedTag => keyTags.includes(selectedTag));

      if (showUntagged && selectedTags.length > 0) {
        // Both untagged and tags selected: show keys with no tags OR with selected tags
        return hasNoTags || hasSelectedTag;
      } else if (showUntagged) {
        // Only untagged selected
        return hasNoTags;
      } else {
        // Only tags selected
        return hasSelectedTag;
      }
    });
  })();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Instance Header with Editable Name */}
        <div className="mb-6 mt-2">
          <div className="flex items-center gap-3 mb-2">
            {editingName ? (
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                onBlur={handleUpdateInstanceName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdateInstanceName();
                  }
                  if (e.key === 'Escape') {
                    setInstanceName(instance?.name || '');
                    setEditingName(false);
                  }
                }}
                className="text-2xl font-semibold bg-transparent border-b-2 border-zinc-500 outline-none px-1"
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-semibold cursor-pointer hover:text-zinc-300 transition group flex items-center gap-2"
                onClick={() => canEdit && setEditingName(true)}
                title={canEdit ? 'Click to edit name' : undefined}
              >
                {instance?.name || 'Loading...'}
                {canEdit && (
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </h1>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-1 text-xs rounded ${
                connected ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
            {connected && (
              <span className="px-2 py-1 text-xs bg-gray-700 rounded">
                {permission === 'system' ? 'admin' : permission}
              </span>
            )}
            {error && <span className="text-red-500 text-sm ml-2">{error}</span>}
          </div>
        </div>

        {/* Action Buttons */}
        {canEdit && (
          <div className="mb-4 flex gap-2 flex-wrap items-center">
            <button
              onClick={() => setShowAddKey(true)}
              className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded hover:bg-zinc-200 transition flex items-center gap-1.5"
              title="Add Key"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Key
            </button>
            <div className="flex gap-1 border-l border-zinc-700 pl-2">
              <button
                onClick={handleExportJSON}
                className="px-2 py-1.5 bg-zinc-700 text-white text-xs font-medium rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
                title="Export as JSON"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                JSON
              </button>
              <button
                onClick={handleExportMarkdown}
                className="px-2 py-1.5 bg-zinc-700 text-white text-xs font-medium rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
                title="Export as Markdown"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                MD
              </button>
            </div>
            <div className="flex gap-1 border-l border-zinc-700 pl-2">
              <button
                onClick={handleImportJSON}
                className="px-2 py-1.5 bg-zinc-700 text-white text-xs font-medium rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
                title="Import from JSON"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                JSON
              </button>
              <button
                onClick={handleImportMarkdown}
                className="px-2 py-1.5 bg-zinc-700 text-white text-xs font-medium rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
                title="Import from Markdown"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                MD
              </button>
            </div>
          </div>
        )}

        {/* Tag Filter */}
        <div className="mb-4">
          <div className="text-sm text-zinc-400 mb-2">Filter by tags:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowUntagged(!showUntagged);
              }}
              className={`px-2 py-1 text-xs rounded transition ${
                showUntagged
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Show keys with no tags"
            >
              untagged
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTags(prev =>
                    prev.includes(tag)
                      ? prev.filter(t => t !== tag)
                      : [...prev, tag]
                  );
                }}
                className={`px-2 py-1 text-xs rounded transition ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {tag}
              </button>
            ))}
            {(selectedTags.length > 0 || showUntagged) && (
              <button
                onClick={() => {
                  setSelectedTags([]);
                  setShowUntagged(false);
                }}
                className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-1"
                title="Clear filters"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Keys List */}
        <div className="space-y-3">
          {filteredKeys.length === 0 ? (
            <div className="text-zinc-500 text-center py-8 border border-zinc-800 rounded-lg">
              {Object.keys(keys).length === 0
                ? `No keys yet. ${canEdit ? 'Add one to get started.' : ''}`
                : selectedTags.length > 0
                  ? 'No keys match the selected tags.'
                  : 'No keys to display.'}
            </div>
          ) : (
            filteredKeys.map(([key, entry]) => {
              const isEmpty = !entry.value || (typeof entry.value === 'string' && entry.value.trim() === '');
              const isSystemKey = key.startsWith('$');
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
              if (entry.attributes.readonly) {
                indicators.push('R');
              }
              if (!entry.attributes.visible) {
                indicators.push('V');
              }
              if (entry.attributes.template) {
                indicators.push('T');
              }
              if (entry.attributes.hardcoded || isSystemKey) {
                indicators.push('H');
              }

              return (
                <div
                  key={key}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-blue-400">{key}</span>
                      {indicators.length > 0 && (
                        <span className="text-xs text-yellow-400 font-mono">
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
                    </div>
                    <div className="flex gap-1">
                      {canEdit && (
                        <button
                          onClick={() => startEditingAttributes(key)}
                          className="text-cyan-600 hover:text-yellow-400 font-mono text-sm leading-none px-1"
                          title="Edit Properties"
                        >
                          ...
                        </button>
                      )}
                      {canEdit && !entry.attributes.readonly && (
                        <button
                          onClick={() => handleDeleteKey(key)}
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
                          className="mt-2 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
                        >
                          Replace Image
                        </button>
                      )}
                    </div>
                  ) : contentType === 'file' ? (
                    <div className="mt-2">
                      <div className="text-sm text-zinc-400">
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
                          className="mt-2 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
                        >
                          Replace File
                        </button>
                      )}
                    </div>
                  ) : canEdit && !entry.attributes.readonly ? (
                    <textarea
                      className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded font-mono text-sm text-zinc-300 focus:border-zinc-500 outline-none resize-y"
                      rows={contentType === 'json' ? 6 : 2}
                      value={keyValues[key] ?? ''}
                      onChange={(e) => handleKeyValueChange(key, e.target.value)}
                      placeholder="Enter value..."
                    />
                  ) : (
                    <pre className="text-sm text-zinc-300 bg-zinc-800 p-2 rounded overflow-x-auto">
                      {displayValue}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add Key Modal */}
        {showAddKey && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Add New Key</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Key Name</label>
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
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value as 'text' | 'json')}
                  >
                    <option value="text">Text</option>
                    <option value="json">JSON</option>
                    <option value="image">Image</option>
                    <option value="file">File</option>
                  </select>
                </div>
                {(newKeyType === 'text' || newKeyType === 'json') && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Value</label>
                    <textarea
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded font-mono text-sm"
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
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
                    >
                      Upload {newKeyType === 'image' ? 'Image' : 'File'}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddKey(false)}
                  className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-500"
                >
                  Cancel
                </button>
                {(newKeyType === 'text' || newKeyType === 'json') && (
                  <button
                    onClick={handleAddKey}
                    className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700"
                    disabled={!newKeyName.trim()}
                  >
                    Add Key
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Attributes Editor Popup */}
        {editingAttributes && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div
              className="bg-black border-2 border-cyan-400 rounded-lg p-6 w-96 max-w-full max-h-full overflow-auto"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  cancelAttributes();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  saveAttributes();
                }
              }}
              tabIndex={0}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-cyan-300 font-mono text-sm">Key Properties</h3>
                <button onClick={cancelAttributes} className="text-cyan-600 hover:text-red-400 font-mono text-sm leading-none">×</button>
              </div>

              <div className="space-y-2">
                {/* Key Name */}
                <div className="flex flex-col space-y-2">
                  <label className="text-gray-400 font-mono text-sm">key name:</label>
                  <input
                    type="text"
                    value={editingKeyName}
                    onChange={(e) => setEditingKeyName(e.target.value)}
                    className="bg-black text-cyan-400 font-mono text-sm border border-cyan-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    placeholder="Key name..."
                  />
                </div>

                {/* Type Selection */}
                <div className="flex flex-col space-y-2">
                  <label className="text-gray-400 font-mono text-sm">type:</label>
                  <select
                    value={attributesForm.type}
                    onChange={(e) => setAttributesForm({
                      ...attributesForm,
                      type: e.target.value as 'text' | 'image' | 'file' | 'json',
                      contentType: (e.target.value === 'text' || e.target.value === 'json') ? '' : attributesForm.contentType
                    })}
                    className="bg-black text-cyan-400 font-mono text-sm border border-cyan-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  >
                    <option value="text">text</option>
                    <option value="json">json</option>
                    <option value="image">image</option>
                    <option value="file">file</option>
                  </select>
                </div>

                {/* Upload Button */}
                {(attributesForm.type === 'image' || attributesForm.type === 'file') && (
                  <div className="flex flex-col space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = attributesForm.type === 'image' ? 'image/*' : '*/*';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file && editingKeyName) {
                            try {
                              setAttributesForm({
                                ...attributesForm,
                                contentType: file.type,
                                type: file.type.startsWith('image/') ? 'image' : 'file'
                              });
                              await handleFileUpload(editingKeyName, file);
                            } catch (error) {
                              console.error('Failed to upload file from popup:', error);
                              alert('Failed to upload file. Please try again.');
                            }
                          }
                        };
                        input.click();
                      }}
                      className="border border-cyan-400 text-cyan-400 font-mono text-sm px-3 py-2 rounded hover:bg-cyan-900 hover:bg-opacity-20 transition-colors"
                    >
                      Upload {attributesForm.type === 'image' ? 'Image' : 'File'}
                    </button>
                  </div>
                )}

                {/* Z-Index */}
                <div className="flex flex-col space-y-2">
                  <label className="text-gray-400 font-mono text-sm">z-index:</label>
                  <input
                    type="text"
                    value={zIndexInput}
                    onChange={(e) => {
                      // Allow typing freely - validate on blur/save
                      setZIndexInput(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and update on blur
                      const value = parseFloat(e.target.value);
                      const finalValue = isNaN(value) ? 0 : value;
                      setZIndexInput(String(finalValue));
                      setAttributesForm({ ...attributesForm, zIndex: finalValue });
                    }}
                    className="bg-black text-cyan-400 font-mono text-sm border border-cyan-400 rounded px-2 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    placeholder="0"
                  />
                  <div className="text-xs text-gray-500">Lower values appear first (supports decimals like 0.4)</div>
                </div>

                {/* Readonly */}
                <div className="flex items-center justify-between">
                  <div className="text-gray-400 font-mono text-sm">
                    <span className="text-yellow-400">[R]</span> readonly:
                    <div className="text-xs text-gray-500 mt-1">If true, won&apos;t appear in AI tools</div>
                  </div>
                  {attributesForm.hardcoded ? (
                    <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.readonly ? 'true' : 'false'}</span>
                  ) : (
                    <button
                      onClick={() => setAttributesForm({ ...attributesForm, readonly: !attributesForm.readonly })}
                      className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                    >
                      {attributesForm.readonly ? 'true' : 'false'}
                    </button>
                  )}
                </div>

                {/* Visible */}
                <div className="flex items-center justify-between">
                  <div className="text-gray-400 font-mono text-sm">
                    <span className="text-yellow-400">[V]</span> visible:
                    <div className="text-xs text-gray-500 mt-1">If false, hidden from injectSTM/getSTM</div>
                  </div>
                  <button
                    onClick={() => setAttributesForm({ ...attributesForm, visible: !attributesForm.visible })}
                    className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                  >
                    {attributesForm.visible ? 'true' : 'false'}
                  </button>
                </div>

                {/* Template */}
                <div className="flex items-center justify-between">
                  <div className="text-gray-400 font-mono text-sm">
                    <span className="text-yellow-400">[T]</span> template:
                    <div className="text-xs text-gray-500 mt-1">Process with injectSTM on get</div>
                  </div>
                  {attributesForm.hardcoded ? (
                    <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.template ? 'true' : 'false'}</span>
                  ) : (
                    <button
                      onClick={() => setAttributesForm({ ...attributesForm, template: !attributesForm.template })}
                      className="text-cyan-400 font-mono text-sm hover:bg-cyan-900 hover:bg-opacity-20 px-2 py-1 rounded transition-colors"
                    >
                      {attributesForm.template ? 'true' : 'false'}
                    </button>
                  )}
                </div>

                {/* Hardcoded */}
                <div className="flex items-center justify-between">
                  <div className="text-gray-400 font-mono text-sm">
                    <span className="text-yellow-400">[H]</span> hardcoded:
                  </div>
                  <span className="text-gray-500 font-mono px-2 py-1">{attributesForm.hardcoded ? 'true' : 'false'}</span>
                </div>

                {/* Tags */}
                <div className="flex flex-col space-y-2">
                  <div className="text-gray-400 font-mono text-sm">tags:</div>

                  <div className="relative">
                    <div className="bg-black border border-cyan-400 rounded px-2 py-2 focus-within:ring-1 focus-within:ring-cyan-400">
                      <div className="flex flex-wrap gap-1 items-center">
                        {attributesForm.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 text-xs bg-cyan-900 bg-opacity-50 text-cyan-300 px-2 py-1 rounded font-mono border border-cyan-600 group hover:bg-cyan-800 hover:bg-opacity-50 transition-colors"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="text-cyan-400 hover:text-red-400 ml-1 leading-none"
                              title="Remove tag"
                            >
                              ×
                            </button>
                          </span>
                        ))}

                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => handleTagInputChange(e.target.value)}
                          onKeyDown={handleTagInput}
                          className="bg-transparent text-cyan-400 font-mono text-sm focus:outline-none flex-1 min-w-0"
                          placeholder={attributesForm.tags.length === 0 ? 'Add tags...' : ''}
                          style={{ minWidth: '80px' }}
                        />
                      </div>
                    </div>

                    {tagSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-black border border-cyan-400 rounded shadow-lg max-h-40 overflow-y-auto">
                        {tagSuggestions.map((tag, index) => (
                          <button
                            key={index}
                            onClick={() => addTagFromSuggestion(tag)}
                            className="w-full text-left px-3 py-2 text-sm font-mono text-cyan-400 hover:bg-cyan-900 hover:bg-opacity-30 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {attributesForm.tags.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Use getTagged(&quot;{attributesForm.tags[0]}&quot;)
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-6">
                <button
                  onClick={saveAttributes}
                  className="flex-1 bg-cyan-400 text-black font-mono text-sm px-4 py-2 rounded hover:bg-cyan-300"
                >
                  Save
                </button>
                <button
                  onClick={cancelAttributes}
                  className="flex-1 border border-cyan-400 text-cyan-400 font-mono text-sm px-4 py-2 rounded hover:bg-cyan-900 hover:bg-opacity-20"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-500 text-center">
                Ctrl+Enter to save &bull; Esc to cancel
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

