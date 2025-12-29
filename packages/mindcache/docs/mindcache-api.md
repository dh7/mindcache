# MindCache API Reference

## Core Types

```typescript
type KeyType = 'text' | 'image' | 'file' | 'json' | 'document';
type SystemTag = 'SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'ApplyTemplate';
type AccessLevel = 'user' | 'admin';

interface KeyAttributes {
  type: KeyType;
  contentType?: string;
  contentTags: string[];
  systemTags: SystemTag[]; // Requires admin access to modify
  zIndex: number;
}

interface STMEntry {
  value: unknown;
  attributes: KeyAttributes;
}
```

## MindCache Class

### Constructor & Initialization

```typescript
constructor(options?: MindCacheOptions)
// options: { cloud?: CloudConfig, indexedDB?: IDBConfig, history?: HistoryOptions, ... }
```

### Core Data & Keys

```typescript
// Get value of a key (resolves templates if processingStack provided)
get_value(key: string, _processingStack?: Set<string>): any

// Set value of a key
set_value(key: string, value: any, attributes?: Partial<KeyAttributes>): void

// Create a new key (throws if exists)
create_key(key: string, value: any, attributes?: Partial<KeyAttributes>): void

// Check if key exists
has(key: string): boolean

// Delete a key
delete_key(key: string): void

// Get attributes for a key
get_attributes(key: string): KeyAttributes | undefined

// Update key attributes (e.g. tags) without changing value
set_attributes(key: string, attributes: Partial<KeyAttributes>): boolean

// Get all keys
keys(): string[]
```

### Context Filtering

```typescript
// Set context to filter visible keys (only keys with ALL tags are visible)
set_context(rules: ContextRules | string[]): void

// Get current context rules
get_context(): ContextRules | null

// Reset context (show all keys)
reset_context(): void
```

### Tag Management

```typescript
// Content Tags (User controllable)
addTag(key: string, tag: string): boolean
removeTag(key: string, tag: string): boolean
hasTag(key: string, tag: string): boolean
getTags(key: string): string[]
getAllTags(): string[]
getKeysByTag(tag: string): string[]

// System Tags (Admin/System only)
systemAddTag(key: string, tag: SystemTag): boolean
systemRemoveTag(key: string, tag: SystemTag): boolean
systemHasTag(key: string, tag: SystemTag): boolean
```

### Documents & Collaboration

```typescript
// Create/Get a collaborative document (Y.Text backed)
set_document(key: string, initialText?: string, attributes?: Partial<KeyAttributes>): void

// Get Y.Text instance for binding to editors
get_document(key: string): Y.Text | undefined

// Manipulate text
insert_text(key: string, index: number, text: string): void
delete_text(key: string, index: number, length: number): void
```

### Serialization & Files

```typescript
// Export/Import entire state as Markdwon
toMarkdown(): string
fromMarkdown(markdown: string, merge: boolean = false): void

// File/Image handling
set_file(key: string, file: File, attributes?: Partial<KeyAttributes>): Promise<void>
get_data_url(key: string): string | undefined
```

### AI Integration

```typescript
// Generate Vercel AI SDK compatible tools for LLM interaction
create_vercel_ai_tools(): Record<string, any>

// Generate system prompt with all visible keys
get_system_prompt(): string

// Execute a tool call
executeToolCall(toolName: string, value: any): { result: string; key: string } | null
```

### Subscriptions & Events

```typescript
// Subscribe to changes on specific key
subscribe(key: string, listener: (value: any) => void): () => void // returns unsubscribe fn

// Subscribe to ALL changes
subscribeToAll(listener: GlobalListener): () => void
```

### History (Undo/Redo)

```typescript
undo(key: string): void
redo(key: string): void
undoAll(): void // Global undo
redoAll(): void // Global redo
getHistory(key: string): HistoryEntry[]
```
