
import { describe, it, expect } from 'vitest';
import { MindCache } from './MindCache';

describe('MindCache fromMarkdown Reproduction', () => {
  it('should correctly import multi-line values that are arguably not code blocks', () => {
    const markdown = `
### test-key
- **Type**: \`text\`
- **Value**: first line
second line
third line

### next-key
- **Value**: next value
`;

    const mc = new MindCache();
    mc.fromMarkdown(markdown);

    const val = mc.get_value('test-key');
    expect(val).toBe('first line\nsecond line\nthird line');

    const nextVal = mc.get_value('next-key');
    expect(nextVal).toBe('next value');
  });

  it('should round-trip multi-line values via toMarkdown and fromMarkdown', () => {
    const mc1 = new MindCache();
    mc1.set_value('mermaid', 'mindmap\n  root(("Test"))\n    "Child 1"\n    "Child 2"', { type: 'document' });
    mc1.set_value('notes', 'Line 1\nLine 2\nLine 3');

    const markdown = mc1.toMarkdown();

    const mc2 = new MindCache();
    mc2.fromMarkdown(markdown);

    expect(mc2.get_value('mermaid')).toBe('mindmap\n  root(("Test"))\n    "Child 1"\n    "Child 2"');
    expect(mc2.get_value('notes')).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should parse code blocks that start on Value line with backticks', () => {
    const markdown = `### mindmap editor
- **Type**: \`text\`
- **System Tags**: \`SystemPrompt\`
- **Value**: \`\`\`
You are here to help the user edit a mind map.
Line 2
Line 3
\`\`\`

### second-key
- **Value**: \`\`\`
Simple value
\`\`\``;

    const mc = new MindCache();
    mc.fromMarkdown(markdown);

    const val = mc.get_value('mindmap editor');
    expect(val).toBe('You are here to help the user edit a mind map.\nLine 2\nLine 3');

    const val2 = mc.get_value('second-key');
    expect(val2).toBe('Simple value');
  });
});
