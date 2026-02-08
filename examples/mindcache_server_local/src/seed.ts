import { promises as fs } from 'node:fs';
import path from 'node:path';

import { MindCache, type KeyAttributes } from '../../../packages/mindcache/dist/server.mjs';

import { DATA_DIR } from './config.ts';

interface Entry {
  key: string;
  value: unknown;
  attributes: Partial<KeyAttributes>;
}

function createMarkdown(entries: Entry[], options: { name: string; description: string }): string {
  const cache = new MindCache({ accessLevel: 'admin' });

  for (const entry of entries) {
    cache.set_value(entry.key, entry.value, entry.attributes);
  }

  return cache.toMarkdown(options);
}

async function writeMarkdownFile(relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(DATA_DIR, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
}

export async function seedExampleFiles(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const teamA = createMarkdown(
    [
      {
        key: 'customer_profile',
        value: 'Acme Corp: enterprise customer, strong expansion in Q2.',
        attributes: {
          contentTags: ['customer', 'acme', 'sales'],
          systemTags: ['SystemPrompt', 'LLMRead'],
          zIndex: 10
        }
      },
      {
        key: 'open_risks',
        value: 'Legal review pending for renewal contract.',
        attributes: {
          contentTags: ['customer', 'risk', 'acme'],
          systemTags: ['SystemPrompt', 'LLMRead'],
          zIndex: 20
        }
      },
      {
        key: 'internal_note',
        value: 'Schedule stakeholder sync every Friday.',
        attributes: {
          contentTags: ['team', 'ops'],
          systemTags: ['LLMRead'],
          zIndex: 30
        }
      }
    ],
    {
      name: 'Team A Memory',
      description: 'Sample MindCache data for Team A'
    }
  );

  const teamB = createMarkdown(
    [
      {
        key: 'customer_profile',
        value: 'Beta Labs: SMB, interested in pilot feature flags.',
        attributes: {
          contentTags: ['customer', 'beta', 'pilot'],
          systemTags: ['SystemPrompt', 'LLMRead'],
          zIndex: 10
        }
      },
      {
        key: 'feature_requests',
        value: 'Needs audit logs and custom retention policy.',
        attributes: {
          contentTags: ['product', 'beta', 'requests'],
          systemTags: ['SystemPrompt', 'LLMRead'],
          zIndex: 20
        }
      }
    ],
    {
      name: 'Team B Memory',
      description: 'Sample MindCache data for Team B'
    }
  );

  await writeMarkdownFile('team-a/memory.md', teamA);
  await writeMarkdownFile('team-b/memory.md', teamB);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedExampleFiles()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(`[example] Seeded MindCache files in ${DATA_DIR}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[example] Failed seeding files: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
