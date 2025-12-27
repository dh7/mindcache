
import { describe, it, expect } from 'vitest';
import { MindCache } from './MindCache';

describe('MindCache import MindElixir Text', () => {
  it('should import MindElixir text format', () => {
    const text = `
    "[R] Global Contexts"
      "What are Global Contexts"
      "Global context is governance over knowledge data"
    "[L] My second brain"
      "PRINCIPLES"
    `;

    const mc = new MindCache();
    mc.fromMarkdown(text);

    // Should have imported into 'imported_content'
    const val = mc.get_value('imported_content');
    expect(val).toBeDefined();
    expect(val).toContain('[R] Global Contexts');
    expect(val).toContain('[L] My second brain');
  });
});
