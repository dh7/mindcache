import { MindCache } from 'mindcache';

describe('MindCache Markdown Serialization', () => {
  let cache: MindCache;

  beforeEach(() => {
    cache = new MindCache();
  });

  describe('toMarkdown()', () => {
    test('should export empty STM to markdown', () => {
      const markdown = cache.toMarkdown();

      expect(markdown).toContain('# MindCache STM Export');
      expect(markdown).toContain('## STM Entries');
      expect(markdown).toContain('*End of MindCache Export*');
    });

    test('should export text values to markdown', () => {
      cache.set_value('username', 'john_doe');
      cache.set_value('email', 'john@example.com');

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('### username');
      expect(markdown).toContain('- **Type**: `text`');
      expect(markdown).toContain('```\njohn_doe\n```');
      expect(markdown).toContain('### email');
      expect(markdown).toContain('```\njohn@example.com\n```');
    });

    test('should export multiline text with code blocks', () => {
      cache.set_value('description', 'Line 1\nLine 2\nLine 3');

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('### description');
      expect(markdown).toContain('- **Value**:');
      expect(markdown).toContain('```\nLine 1\nLine 2\nLine 3\n```');
    });

    test('should export JSON values with formatting', () => {
      const jsonData = { theme: 'dark', notifications: true, count: 42 };
      cache.set_value('config', JSON.stringify(jsonData), { type: 'json' });

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('### config');
      expect(markdown).toContain('- **Type**: `json`');
      expect(markdown).toContain('```json');
      expect(markdown).toContain('"theme"');
      expect(markdown).toContain('"dark"');
    });

    test('should export all attributes', () => {
      cache.set_value('test_key', 'value', {
        readonly: true,
        visible: false,
        template: true,
        tags: ['tag1', 'tag2', 'tag3']
      });

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('- **Readonly**: `true`');
      expect(markdown).toContain('- **Visible**: `false`');
      expect(markdown).toContain('- **Template**: `true`');
      expect(markdown).toContain('- **Tags**: `tag1`, `tag2`, `tag3`');
    });

    test('should export image to appendix', () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      cache.set_base64('profile_pic', base64Image, 'image/png', 'image');

      const markdown = cache.toMarkdown();

      // Check entry references appendix
      expect(markdown).toContain('### profile_pic');
      expect(markdown).toContain('- **Type**: `image`');
      expect(markdown).toContain('- **Content Type**: `image/png`');
      expect(markdown).toContain('- **Value**: [See Appendix A]');

      // Check appendix section exists
      expect(markdown).toContain('## Appendix: Binary Data');
      expect(markdown).toContain('### Appendix A: profile_pic');
      expect(markdown).toContain('**Type**: image/png');
      expect(markdown).toContain(base64Image);
    });

    test('should export file to appendix', () => {
      const base64File = 'JVBERi0xLjQKJeLjz9MK';
      cache.set_base64('document', base64File, 'application/pdf', 'file');

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('### document');
      expect(markdown).toContain('- **Type**: `file`');
      expect(markdown).toContain('- **Content Type**: `application/pdf`');
      expect(markdown).toContain('- **Value**: [See Appendix A]');
      expect(markdown).toContain('## Appendix: Binary Data');
      expect(markdown).toContain('### Appendix A: document');
      expect(markdown).toContain(base64File);
    });

    test('should export multiple images to appendix with different labels', () => {
      cache.set_base64('img1', 'base64data1', 'image/jpeg', 'image');
      cache.set_base64('img2', 'base64data2', 'image/png', 'image');
      cache.set_base64('img3', 'base64data3', 'image/gif', 'image');

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('[See Appendix A]');
      expect(markdown).toContain('[See Appendix B]');
      expect(markdown).toContain('[See Appendix C]');
      expect(markdown).toContain('### Appendix A:');
      expect(markdown).toContain('### Appendix B:');
      expect(markdown).toContain('### Appendix C:');
    });

    test('should not export hardcoded keys', () => {
      cache.set_value('hardcoded_key', 'value', { hardcoded: true });
      cache.set_value('normal_key', 'value');

      const markdown = cache.toMarkdown();

      expect(markdown).not.toContain('### hardcoded_key');
      expect(markdown).toContain('### normal_key');
    });

    test('should export mixed content types', () => {
      cache.set_value('text', 'simple text');
      cache.set_value('json_data', '{"key":"value"}', { type: 'json' });
      cache.set_base64('image', 'img_base64', 'image/jpeg', 'image');
      cache.set_value('multiline', 'line1\nline2');

      const markdown = cache.toMarkdown();

      expect(markdown).toContain('### text');
      expect(markdown).toContain('### json_data');
      expect(markdown).toContain('### image');
      expect(markdown).toContain('### multiline');
      expect(markdown).toContain('## Appendix: Binary Data');
    });
  });

  describe('fromMarkdown()', () => {
    test('should import empty markdown', () => {
      const markdown = `# MindCache STM Export

Export Date: 2025-10-01

---

## STM Entries

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      // Should have system keys only
      expect(cache.size()).toBe(2); // $date and $time
    });

    test('should import text values', () => {
      const markdown = `# MindCache STM Export

Export Date: 2025-10-01

---

## STM Entries

### username
- **Type**: \`text\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Value**:
\`\`\`
john_doe
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_value('username')).toBe('john_doe');
      expect(cache.get_attributes('username')?.type).toBe('text');
      expect(cache.get_attributes('username')?.readonly).toBe(false);
      expect(cache.get_attributes('username')?.visible).toBe(true);
    });

    test('should import multiline text from code blocks', () => {
      const markdown = `# MindCache STM Export

## STM Entries

### description
- **Type**: \`text\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Value**:
\`\`\`
Line 1
Line 2
Line 3
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_value('description')).toBe('Line 1\nLine 2\nLine 3');
    });

    test('should import JSON values', () => {
      const markdown = `# MindCache STM Export

## STM Entries

### config
- **Type**: \`json\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Value**:
\`\`\`json
{"theme":"dark","count":42}
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_value('config')).toBe('{"theme":"dark","count":42}');
      expect(cache.get_attributes('config')?.type).toBe('json');
    });

    test('should import all attributes correctly', () => {
      const markdown = `# MindCache STM Export

## STM Entries

### test_key
- **Type**: \`text\`
- **Readonly**: \`true\`
- **Visible**: \`false\`
- **Template**: \`true\`
- **Tags**: \`tag1\`, \`tag2\`, \`tag3\`
- **Value**:
\`\`\`
value
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      const attrs = cache.get_attributes('test_key');
      expect(attrs?.readonly).toBe(true);
      expect(attrs?.visible).toBe(false);
      expect(attrs?.template).toBe(true);
      expect(attrs?.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('should import image from appendix', () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const markdown = `# MindCache STM Export

## STM Entries

### profile_pic
- **Type**: \`image\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Content Type**: \`image/png\`
- **Value**: [See Appendix A]

---

## Appendix: Binary Data

### Appendix A: profile_pic
**Type**: image/png

\`\`\`
${base64Image}
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_base64('profile_pic')).toBe(base64Image);
      expect(cache.get_attributes('profile_pic')?.type).toBe('image');
      expect(cache.get_attributes('profile_pic')?.contentType).toBe('image/png');
    });

    test('should import file from appendix', () => {
      const base64File = 'JVBERi0xLjQKJeLjz9MK';
      const markdown = `# MindCache STM Export

## STM Entries

### document
- **Type**: \`file\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Content Type**: \`application/pdf\`
- **Value**: [See Appendix A]

---

## Appendix: Binary Data

### Appendix A: document
**Type**: application/pdf

\`\`\`
${base64File}
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_base64('document')).toBe(base64File);
      expect(cache.get_attributes('document')?.type).toBe('file');
      expect(cache.get_attributes('document')?.contentType).toBe('application/pdf');
    });

    test('should import multiple items from appendix', () => {
      const markdown = `# MindCache STM Export

## STM Entries

### img1
- **Type**: \`image\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Content Type**: \`image/jpeg\`
- **Value**: [See Appendix A]

---

### img2
- **Type**: \`image\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Content Type**: \`image/png\`
- **Value**: [See Appendix B]

---

## Appendix: Binary Data

### Appendix A: img1
**Type**: image/jpeg

\`\`\`
base64data1
\`\`\`

---

### Appendix B: img2
**Type**: image/png

\`\`\`
base64data2
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.get_base64('img1')).toBe('base64data1');
      expect(cache.get_base64('img2')).toBe('base64data2');
      expect(cache.get_attributes('img1')?.contentType).toBe('image/jpeg');
      expect(cache.get_attributes('img2')?.contentType).toBe('image/png');
    });
  });

  describe('Round-trip serialization', () => {
    test('should preserve text values through export and import', () => {
      cache.set_value('key1', 'value1');
      cache.set_value('key2', 'value2');

      const markdown = cache.toMarkdown();

      const newCache = new MindCache();
      newCache.fromMarkdown(markdown);

      expect(newCache.get_value('key1')).toBe('value1');
      expect(newCache.get_value('key2')).toBe('value2');
    });

    test('should preserve all attributes through round-trip', () => {
      cache.set_value('test_key', 'value', {
        readonly: true,
        visible: false,
        template: true,
        tags: ['a', 'b', 'c']
      });

      const markdown = cache.toMarkdown();

      const newCache = new MindCache();
      newCache.fromMarkdown(markdown);

      const attrs = newCache.get_attributes('test_key');
      expect(attrs?.readonly).toBe(true);
      expect(attrs?.visible).toBe(false);
      expect(attrs?.template).toBe(true);
      expect(attrs?.tags).toEqual(['a', 'b', 'c']);
    });

    test('should preserve images through round-trip', () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      cache.set_base64('profile_pic', base64Image, 'image/png', 'image', { tags: ['media'] });

      const markdown = cache.toMarkdown();

      const newCache = new MindCache();
      newCache.fromMarkdown(markdown);

      expect(newCache.get_base64('profile_pic')).toBe(base64Image);
      expect(newCache.get_attributes('profile_pic')?.type).toBe('image');
      expect(newCache.get_attributes('profile_pic')?.contentType).toBe('image/png');
      expect(newCache.get_attributes('profile_pic')?.tags).toEqual(['media']);
    });

    test('should preserve mixed content through round-trip', () => {
      cache.set_value('text', 'simple text', { tags: ['basic'] });
      cache.set_value('json_data', '{"key":"value"}', { type: 'json', readonly: true });
      cache.set_base64('image', 'img_base64', 'image/jpeg', 'image', { visible: false });
      cache.set_value('multiline', 'line1\nline2\nline3', { template: true });

      const markdown = cache.toMarkdown();

      const newCache = new MindCache();
      newCache.fromMarkdown(markdown);

      expect(newCache.get_value('text')).toBe('simple text');
      expect(newCache.get_value('json_data')).toBe('{"key":"value"}');
      expect(newCache.get_base64('image')).toBe('img_base64');
      expect(newCache.get_value('multiline')).toBe('line1\nline2\nline3');

      expect(newCache.get_attributes('text')?.tags).toEqual(['basic']);
      expect(newCache.get_attributes('json_data')?.readonly).toBe(true);
      expect(newCache.get_attributes('image')?.visible).toBe(false);
      expect(newCache.get_attributes('multiline')?.template).toBe(true);
    });

    test('should clear existing data before importing', () => {
      cache.set_value('old_key', 'old_value');

      const markdown = `# MindCache STM Export

## STM Entries

### new_key
- **Type**: \`text\`
- **Readonly**: \`false\`
- **Visible**: \`true\`
- **Template**: \`false\`
- **Value**:
\`\`\`
new_value
\`\`\`

---

*End of MindCache Export*`;

      cache.fromMarkdown(markdown);

      expect(cache.has('old_key')).toBe(false);
      expect(cache.has('new_key')).toBe(true);
      expect(cache.get_value('new_key')).toBe('new_value');
    });
  });
});

