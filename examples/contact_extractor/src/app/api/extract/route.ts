import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { MindCache } from 'mindcache/server';

// Contact type schema
const CONTACT_SCHEMA = `
#Contact
* name: full name of the contact
* email: email address (primary)
* phone: phone number (mobile preferred)
* company: company or organization name
* role: job title or role
* address: physical address
* linkedin: LinkedIn profile URL
* twitter: Twitter/X handle
* birthday: birthday in YYYY-MM-DD format
* notes: any additional notes or context about this person
`;

export async function POST(request: Request) {
  try {
    const { content, existingContacts } = await request.json();

    if (!content || typeof content !== 'string') {
      return Response.json({ error: 'Content is required' }, { status: 400 });
    }

    // Create a temporary MindCache with existing contacts
    const mc = new MindCache();
    mc.registerType('Contact', CONTACT_SCHEMA);

    // Hydrate with existing contacts
    if (existingContacts) {
      for (const [key, contact] of Object.entries(existingContacts)) {
        mc.set_value(key, JSON.stringify(contact), {
          systemTags: ['SystemPrompt', 'LLMRead', 'LLMWrite']
        });
        mc.setType(key, 'Contact');
      }
    }

    // Get system prompt and tools from MindCache
    const systemPrompt = mc.get_system_prompt();
    const tools = mc.create_vercel_ai_tools();

    // Run agent with tools
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      toolChoice: 'required' as const,
      system: `You are a contact management assistant. You manage contacts using MindCache tools.

EXISTING DATA:
${systemPrompt || '(no contacts yet)'}

TOOLS:
- create_key: Create a NEW contact. Use key like "contact_john_doe", value is JSON string, type is "Contact"
- write_<key>: Update an existing contact (rewrite with FULL merged JSON)

RULES:
1. ALWAYS prefer UPDATING existing contacts over creating new ones
2. If a person already exists, use write_<key> to UPDATE with merged data
3. Only use create_key for people NOT already in the database
4. When updating, MERGE new info with existing - don't lose existing fields!
5. Value must be a JSON string with fields: name, email, phone, company, role, address, linkedin, twitter, birthday, notes
6. When creating, always set type to "Contact"
7. If the information is in CSV format, you have to process it and create a new contact for each row.
8. If the information is about a contact, you have to create a new contact or update the existing one.
9. More generally, do what seems more appropriate.`,
      prompt: content,
    });

    // Collect all the contacts that were modified
    const updatedContacts: Array<{ key: string; contact: any }> = [];
    
    for (const key of mc.keys()) {
      if (mc.getKeyType(key) === 'Contact') {
        const value = mc.get_value(key);
        if (value) {
          try {
            const contact = typeof value === 'string' ? JSON.parse(value) : value;
            updatedContacts.push({ key, contact });
          } catch {
            // Skip invalid
          }
        }
      }
    }

    return Response.json({ 
      contacts: updatedContacts,
      message: result.text 
    });
  } catch (error) {
    console.error('Agent error:', error);
    return Response.json(
      { error: 'Failed to process contacts' },
      { status: 500 }
    );
  }
}
