import { CustomTypeDefinition, CustomTypeField } from './types';

/**
 * Parses markdown-based schema definitions into structured CustomTypeDefinition objects.
 *
 * Schema format:
 * ```
 * #TypeName
 * * fieldName: description of the field
 * * anotherField: description
 * ```
 */
export class SchemaParser {
  /**
   * Parse a markdown schema string into a CustomTypeDefinition
   * @param schema - Markdown schema string
   * @returns Parsed type definition
   * @throws Error if schema format is invalid
   */
  static parse(schema: string): CustomTypeDefinition {
    const lines = schema.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new Error('Schema cannot be empty');
    }

    // Parse type name from first line (format: #TypeName or # TypeName)
    const typeNameMatch = lines[0].match(/^#\s*(\w+)$/);
    if (!typeNameMatch) {
      throw new Error(`Invalid schema: first line must be "#TypeName", got "${lines[0]}"`);
    }
    const typeName = typeNameMatch[1];

    // Parse fields from remaining lines (format: * fieldName: description)
    const fields: CustomTypeField[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const fieldMatch = line.match(/^\*\s*([^:]+):\s*(.+)$/);
      if (fieldMatch) {
        fields.push({
          name: fieldMatch[1].trim(),
          description: fieldMatch[2].trim()
        });
      }
      // Skip lines that don't match the field pattern (allows for comments/blank lines)
    }

    if (fields.length === 0) {
      throw new Error(`Schema "${typeName}" must have at least one field`);
    }

    return {
      name: typeName,
      fields,
      rawSchema: schema
    };
  }

  /**
   * Generate a markdown representation of a type definition
   * Useful for including in LLM prompts
   */
  static toMarkdown(typeDef: CustomTypeDefinition): string {
    const lines = [`#${typeDef.name}`];
    for (const field of typeDef.fields) {
      lines.push(`* ${field.name}: ${field.description}`);
    }
    return lines.join('\n');
  }

  /**
   * Generate a prompt-friendly description of the type
   * More verbose than toMarkdown, better for LLM guidance
   */
  static toPromptDescription(typeDef: CustomTypeDefinition): string {
    const fieldDescs = typeDef.fields.map(f => `  - ${f.name}: ${f.description}`).join('\n');
    return `Type "${typeDef.name}" with fields:\n${fieldDescs}`;
  }

  /**
   * Generate an example value structure based on the type definition
   */
  static generateExample(typeDef: CustomTypeDefinition): string {
    const lines = [`#${typeDef.name.toLowerCase()}`];
    for (const field of typeDef.fields) {
      lines.push(`* ${field.name}: [${field.description}]`);
    }
    return lines.join('\n');
  }
}
