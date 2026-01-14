import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// Contact schema matching our MindCache custom type
const ContactSchema = z.object({
  name: z.string().describe('Full name of the contact'),
  email: z.string().optional().describe('Email address'),
  phone: z.string().optional().describe('Phone number'),
  company: z.string().optional().describe('Company or organization'),
  role: z.string().optional().describe('Job title or role'),
  notes: z.string().optional().describe('Any additional notes or context'),
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
Look for names, email addresses, phone numbers, company names, job titles, and any relevant notes.
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
