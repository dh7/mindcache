import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';
import { MindCache, type KeyAttributes } from 'mindcache/server';

import { MindCacheServerCore } from '../src/MindCacheServerCore';

interface EntryDefinition {
  key: string;
  value: unknown;
  attributes?: Partial<KeyAttributes>;
}

async function writeMarkdownFile(filePath: string, entries: EntryDefinition[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const cache = new MindCache({ accessLevel: 'admin' });
  for (const entry of entries) {
    cache.set_value(entry.key, entry.value, entry.attributes);
  }

  await fs.writeFile(filePath, cache.toMarkdown(), 'utf8');
}

async function createTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'mindcache-server-test-'));
}

describe('MindCacheServerCore', () => {
  test('applies key-level diffs when one key changes in a file', async () => {
    const rootDir = await createTempRoot();
    const filePath = path.join(rootDir, 'team', 'memory.md');

    await writeMarkdownFile(filePath, [
      {
        key: 'profile',
        value: 'alice-v1',
        attributes: {
          contentTags: ['user', 'profile'],
          systemTags: ['SystemPrompt', 'LLMRead']
        }
      },
      {
        key: 'notes',
        value: 'note-v1',
        attributes: {
          contentTags: ['team'],
          systemTags: ['SystemPrompt', 'LLMRead']
        }
      }
    ]);

    const core = new MindCacheServerCore({
      rootDir,
      watch: false,
      pollIntervalMs: 0
    });

    try {
      await core.start();

      await writeMarkdownFile(filePath, [
        {
          key: 'profile',
          value: 'alice-v2',
          attributes: {
            contentTags: ['user', 'profile', 'vip'],
            systemTags: ['SystemPrompt', 'LLMRead']
          }
        },
        {
          key: 'notes',
          value: 'note-v1',
          attributes: {
            contentTags: ['team'],
            systemTags: ['SystemPrompt', 'LLMRead']
          }
        }
      ]);

      await core.reconcile('test-update');

      const profileKey = 'team/memory.md::profile';
      const notesKey = 'team/memory.md::notes';

      expect(core.getEntry(profileKey)?.value).toBe('alice-v2');
      expect(core.getEntry(notesKey)?.value).toBe('note-v1');
      expect(core.getTagsForKey(profileKey)).toEqual(['profile', 'user', 'vip']);
      expect(core.findKeysByTags(['vip'])).toEqual([profileKey]);
    } finally {
      await core.stop();
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  test('uses relative path prefixes to avoid key collisions', async () => {
    const rootDir = await createTempRoot();

    await writeMarkdownFile(path.join(rootDir, 'project-a', 'cache.md'), [
      {
        key: 'note',
        value: 'a',
        attributes: {
          contentTags: ['shared'],
          systemTags: ['SystemPrompt']
        }
      }
    ]);

    await writeMarkdownFile(path.join(rootDir, 'project-b', 'cache.md'), [
      {
        key: 'note',
        value: 'b',
        attributes: {
          contentTags: ['shared'],
          systemTags: ['SystemPrompt']
        }
      }
    ]);

    const core = new MindCacheServerCore({
      rootDir,
      watch: false,
      pollIntervalMs: 0
    });

    try {
      await core.start();

      const keys = core.findKeysByTags(['shared']);
      expect(keys).toEqual([
        'project-a/cache.md::note',
        'project-b/cache.md::note'
      ]);
    } finally {
      await core.stop();
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  test('removes keys when source file is deleted', async () => {
    const rootDir = await createTempRoot();
    const filePath = path.join(rootDir, 'delete-me.md');

    await writeMarkdownFile(filePath, [
      {
        key: 'tmp',
        value: 'exists',
        attributes: {
          contentTags: ['tmp'],
          systemTags: ['SystemPrompt']
        }
      }
    ]);

    const core = new MindCacheServerCore({
      rootDir,
      watch: false,
      pollIntervalMs: 0
    });

    try {
      await core.start();
      expect(core.findKeysByTags(['tmp'])).toEqual(['delete-me.md::tmp']);

      await fs.rm(filePath, { force: true });
      await core.reconcile('test-delete');

      expect(core.findKeysByTags(['tmp'])).toEqual([]);
      expect(core.getStats().keys).toBe(0);
    } finally {
      await core.stop();
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  test('context window query respects tag filtering and visibility', async () => {
    const rootDir = await createTempRoot();

    await writeMarkdownFile(path.join(rootDir, 'ctx.md'), [
      {
        key: 'visible',
        value: 'visible-value',
        attributes: {
          contentTags: ['ctx'],
          systemTags: ['SystemPrompt']
        }
      },
      {
        key: 'hidden',
        value: 'hidden-value',
        attributes: {
          contentTags: ['ctx'],
          systemTags: []
        }
      }
    ]);

    const core = new MindCacheServerCore({
      rootDir,
      watch: false,
      pollIntervalMs: 0
    });

    try {
      await core.start();

      const context = core.getContextWindow({ tags: ['ctx'] });
      expect(context.keys).toEqual(['ctx.md::hidden', 'ctx.md::visible']);
      expect(context.visibleKeys).toEqual(['ctx.md::visible']);
      expect(context.contextWindow).toContain('ctx.md::visible');
      expect(context.contextWindow).not.toContain('ctx.md::hidden');
    } finally {
      await core.stop();
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });
});
