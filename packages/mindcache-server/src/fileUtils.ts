import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MindCache, DEFAULT_KEY_ATTRIBUTES, type KeyAttributes, type STM } from 'mindcache/server';

import type { EntrySnapshot } from './types';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mindcache']);

export function normalizeExtensions(extensions: string[]): Set<string> {
  return new Set(
    extensions.map(ext => ext.trim().toLowerCase()).filter(Boolean).map(ext => ext.startsWith('.') ? ext : `.${ext}`)
  );
}

export function normalizeFileId(fileId: string): string {
  return fileId.split(path.sep).join('/');
}

export function toFileId(rootDir: string, absolutePath: string): string {
  const relative = path.relative(rootDir, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`File is outside rootDir: ${absolutePath}`);
  }
  return normalizeFileId(relative);
}

export function toCanonicalKey(fileId: string, rawKey: string): string {
  return `${fileId}::${rawKey}`;
}

export async function readFileText(absolutePath: string): Promise<string> {
  return fs.readFile(absolutePath, 'utf8');
}

function isMarkdownFile(absolutePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(absolutePath).toLowerCase());
}

function normalizeAttributes(attributes: Partial<KeyAttributes> | undefined): KeyAttributes {
  const merged = {
    ...DEFAULT_KEY_ATTRIBUTES,
    ...attributes
  };

  return {
    ...merged,
    contentTags: Array.from(new Set(merged.contentTags || [])),
    systemTags: Array.from(new Set(merged.systemTags || [])),
    zIndex: merged.zIndex ?? 0
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  const pairs = keys.map(key => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`);
  return `{${pairs.join(',')}}`;
}

function hashEntry(value: unknown, attributes: KeyAttributes): string {
  const serialized = stableStringify({ value, attributes });
  return createHash('sha256').update(serialized).digest('hex');
}

export function parseMindCacheFile(content: string, absolutePath: string): Map<string, EntrySnapshot> {
  const extension = path.extname(absolutePath).toLowerCase();
  const cache = new MindCache({ accessLevel: 'admin' });

  if (isMarkdownFile(absolutePath)) {
    cache.fromMarkdown(content, false);
  } else if (extension === '.json') {
    const parsed = JSON.parse(content) as STM;
    cache.deserialize(parsed);
  } else {
    throw new Error(`Unsupported file extension: ${extension}`);
  }

  const serialized = cache.serialize();
  const entries = new Map<string, EntrySnapshot>();

  for (const [rawKey, entry] of Object.entries(serialized)) {
    if (rawKey.startsWith('$')) {
      continue;
    }

    const attributes = normalizeAttributes(entry.attributes);
    const hash = hashEntry(entry.value, attributes);

    entries.set(rawKey, {
      rawKey,
      value: entry.value,
      attributes,
      hash
    });
  }

  return entries;
}
