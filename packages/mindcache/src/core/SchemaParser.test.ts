import { describe, it, expect } from 'vitest';
import { SchemaParser } from './SchemaParser';

describe('SchemaParser', () => {
  describe('parse', () => {
    it('should parse a valid schema', () => {
      const schema = `
#Contact
* name: full name
* birthday: in YYYY-MM-DD format
* email: multiple emails if needed ";"
`;
      const result = SchemaParser.parse(schema);

      expect(result.name).toBe('Contact');
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0]).toEqual({ name: 'name', description: 'full name' });
      expect(result.fields[1]).toEqual({ name: 'birthday', description: 'in YYYY-MM-DD format' });
      expect(result.fields[2]).toEqual({ name: 'email', description: 'multiple emails if needed ";"' });
      expect(result.rawSchema).toBe(schema);
    });

    it('should handle schema without leading newline', () => {
      const schema = `#Note
* content: the main content
* tags: comma separated tags`;
      const result = SchemaParser.parse(schema);

      expect(result.name).toBe('Note');
      expect(result.fields).toHaveLength(2);
    });

    it('should handle type name with space after #', () => {
      const schema = `# Person
* name: full name`;
      const result = SchemaParser.parse(schema);

      expect(result.name).toBe('Person');
    });

    it('should throw on empty schema', () => {
      expect(() => SchemaParser.parse('')).toThrow('Schema cannot be empty');
      expect(() => SchemaParser.parse('   \n  ')).toThrow('Schema cannot be empty');
    });

    it('should throw on invalid header format', () => {
      expect(() => SchemaParser.parse('Contact\n* name: x')).toThrow('first line must be "#TypeName"');
      expect(() => SchemaParser.parse('##Contact\n* name: x')).toThrow('first line must be "#TypeName"');
    });

    it('should throw if no fields defined', () => {
      expect(() => SchemaParser.parse('#Empty')).toThrow('must have at least one field');
      expect(() => SchemaParser.parse('#NoFields\nsome random text')).toThrow('must have at least one field');
    });

    it('should skip non-field lines', () => {
      const schema = `#Type
Some description text
* field1: value
Another comment
* field2: value`;
      const result = SchemaParser.parse(schema);

      expect(result.fields).toHaveLength(2);
    });
  });

  describe('toMarkdown', () => {
    it('should convert type definition back to markdown', () => {
      const typeDef = {
        name: 'Contact',
        fields: [
          { name: 'name', description: 'full name' },
          { name: 'email', description: 'email address' }
        ],
        rawSchema: ''
      };

      const markdown = SchemaParser.toMarkdown(typeDef);
      expect(markdown).toBe('#Contact\n* name: full name\n* email: email address');
    });
  });

  describe('toPromptDescription', () => {
    it('should generate verbose description for LLM', () => {
      const typeDef = {
        name: 'Contact',
        fields: [
          { name: 'name', description: 'full name' },
          { name: 'email', description: 'email address' }
        ],
        rawSchema: ''
      };

      const desc = SchemaParser.toPromptDescription(typeDef);
      expect(desc).toContain('Type "Contact"');
      expect(desc).toContain('- name: full name');
      expect(desc).toContain('- email: email address');
    });
  });

  describe('generateExample', () => {
    it('should generate example value structure', () => {
      const typeDef = {
        name: 'Contact',
        fields: [
          { name: 'name', description: 'full name' },
          { name: 'email', description: 'email address' }
        ],
        rawSchema: ''
      };

      const example = SchemaParser.generateExample(typeDef);
      expect(example).toContain('#contact');
      expect(example).toContain('* name: [full name]');
      expect(example).toContain('* email: [email address]');
    });
  });
});
