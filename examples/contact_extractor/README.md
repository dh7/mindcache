# Contact Extractor

A simple example demonstrating MindCache's custom type system with AI-powered contact extraction.

## Features

- **Drop Zone**: Drag and drop text files or paste content directly
- **AI Extraction**: Uses OpenAI to extract contact information from any content
- **Custom Types**: Contacts are stored using MindCache's new `registerType()` feature
- **Real-time Updates**: Contact cards update instantly via MindCache subscriptions

## MindCache Custom Type

This example registers a `Contact` type with the following schema:

```markdown
#Contact
* name: full name of the contact
* email: email address
* phone: phone number
* company: company or organization
* role: job title or role
* notes: any additional notes
```

## Setup

1. Copy the environment file:
   ```bash
   cp env.example .env.local
   ```

2. Add your OpenAI API key to `.env.local`

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Paste or drop any content containing contact information:
   - Email signatures
   - Business cards (text)
   - Contact lists
   - Meeting notes
   - Any text with names, emails, phones, etc.

2. Click "Extract Contacts" or drop content directly

3. View extracted contacts as cards on the right panel

## How It Works

```typescript
// Register the Contact type
mc.registerType('Contact', `
#Contact
* name: full name of the contact
* email: email address
...
`);

// Create a contact and assign the type
mc.set_value('contact_123', JSON.stringify(contact), { systemTags: ['LLMWrite'] });
mc.setType('contact_123', 'Contact');

// Query contacts by type
for (const key of mc.keys()) {
  if (mc.getKeyType(key) === 'Contact') {
    const contact = JSON.parse(mc.get_value(key));
    // ...
  }
}
```
