import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// Contact schema matching our MindCache custom type
const ContactSchema = z.object({
  name: z.string().describe('Full name of the contact'),
  email: z.string().optional().describe('Email address (primary)'),
  phone: z.string().optional().describe('Phone number (mobile preferred)'),
  company: z.string().optional().describe('Company or organization name'),
  role: z.string().optional().describe('Job title or role'),
  address: z.string().optional().describe('Physical address'),
  linkedin: z.string().optional().describe('LinkedIn profile URL'),
  twitter: z.string().optional().describe('Twitter/X handle'),
  birthday: z.string().optional().describe('Birthday in YYYY-MM-DD format'),
  notes: z.string().optional().describe('Any additional notes or context about this person'),
});

const ExtractedContactsSchema = z.object({
  contacts: z.array(ContactSchema).describe('List of extracted contacts'),
});

export async function POST(request: Request) {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return Response.json({ error: 'Content is required' }, { status: 400 });
    }

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ExtractedContactsSchema,
      prompt: `Extract all contact information from the following content.

Look for:
- Names (full name)
- Email addresses
- Phone numbers (mobile preferred)
- Company/organization names
- Job titles/roles
- Physical addresses
- LinkedIn profile URLs
- Twitter/X handles
- Birthdays (format as YYYY-MM-DD)
- Any additional notes or context about the person

If information is missing, omit that field rather than guessing.
Extract as many contacts as you can find.

Content:
${content}`,
    });

    return Response.json({ contacts: object.contacts });
  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json(
      { error: 'Failed to extract contacts' },
      { status: 500 }
    );
  }
}
