# MindCache Next.js + Shadcn/ui Example

A beautiful, modern implementation showcasing MindCache integration with AI SDK v5. Features templated prompts, AI tools, and type-safe chat with agentic loop control, built with Next.js 14, TypeScript, and Shadcn/ui components.

![MindCache Next.js Example](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?style=for-the-badge&logo=tailwind-css)

## ✨ Features

- **🧠 MindCache Integration**: Full STM (Short-Term Memory) functionality with persistent storage
- **🎨 Beautiful UI**: Modern design with Shadcn/ui components
- **⚡ Real-time Updates**: STM display updates automatically as you interact
- **🔒 Secure**: API keys are stored server-side in environment variables
- **📱 Responsive**: Works perfectly on desktop and mobile
- **🌈 Gradient Design**: Beautiful gradients and modern styling
- **🔄 Template Processing**: Live STM injection with `{key}` syntax
- **🤖 AI SDK v5 Integration**: Type-safe chat with agentic loop control
- **🛠️ Dynamic Tools**: AI can use tools to update memory and fetch data
- **🔍 Web Search**: OpenAI's built-in web search with citations and sources
- **📊 Data Parts**: Structured data streaming with real-time updates
- **🔁 Agentic Loops**: Multi-step reasoning with configurable stopping conditions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd examples/nextjs-shadcn-templated-prompt
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables:**
   ```bash
   cp env.example .env.local
   ```
   
   Then edit `.env.local` and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 How to Use

### Demo Options
The app includes three different demos showcasing various MindCache and AI SDK v5 features:

1. **Templated Prompt Demo**:
   - Fill out the form with your personal information
   - Watch the STM update in real-time as you type
   - Customize the template using `{key}` syntax for STM injection
   - Process the template to see STM values injected
   - Generate content with OpenAI to see personalized results

2. **AI Tools Demo**:
   - Enter natural language describing yourself
   - Watch AI use tools to extract and store information in STM
   - See real-time tool execution and memory updates

3. **AI SDK v5 Type-Safe Chat Demo**:
   - Experience full type safety from server to client
   - Try weather queries: "What's the weather in Tokyo?"
   - Store memories: "Remember that I'm a developer"
   - Enable agentic mode for multi-step reasoning
   - See real-time data parts and structured responses

## 🧠 STM Template Syntax

Use these placeholders in your templates:

- `{firstName}` - Injects first name from STM
- `{lastName}` - Injects last name from STM  
- `{age}` - Injects age from STM
- `{gender}` - Injects gender from STM
- `{$date}` - Automatically injects current date (YYYY-MM-DD)
- `{$time}` - Automatically injects current time (HH:MM:SS)

### Example Template

```
Create a personalized introduction for {firstName} {lastName}, who is {age} years old and identifies as {gender}. The introduction should be warm, professional, and suitable for a networking event. Include some interesting conversation starters based on their demographic. Write it in a friendly, engaging tone. Today's date is {$date} and the current time is {$time}.
```

## 🚀 AI SDK v5 Features

The new Type-Safe Chat demo showcases cutting-edge AI SDK v5 capabilities:

### 🎯 Full Type Safety
- **Custom Message Types**: Define your own `UIMessage` types with specific metadata and data parts
- **End-to-End Types**: Complete type safety from API routes to React components
- **Tool Type Safety**: Fully typed tool inputs and outputs with automatic validation

### 📊 Data Parts
- **Structured Streaming**: Stream typed data alongside text responses
- **Real-time Updates**: Update the same data part by ID for live status changes
- **Transient Parts**: Send notifications that don't persist in chat history

### 🤖 Agentic Loop Control
- **stopWhen Conditions**: Define when multi-step reasoning should stop
- **prepareStep Hooks**: Customize model parameters for each reasoning step
- **Step Notifications**: Real-time feedback on agent progress
- **Context Management**: Automatic context compression for long conversations

### Example Conversations
```
User: "What's the weather in London and remember my favorite city is Paris"
Assistant: [Step 1: Get weather, Step 2: Store memory, combines results with data parts]

User: "Find my stored preferences and get weather for my favorite city"
Assistant: [Step 1: Search memory, Step 2: Get weather for Paris, structured response]
```

## 🛠 Tech Stack

- **[Next.js 14](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS
- **[Shadcn/ui](https://ui.shadcn.com/)** - Beautiful, accessible components
- **[Lucide React](https://lucide.dev/)** - Beautiful icons
- **[AI SDK v5](https://sdk.vercel.ai/)** - Type-safe AI application framework
- **[MindCache](https://www.npmjs.com/package/mindcache)** - STM management
- **[Zod v4](https://zod.dev/)** - TypeScript-first schema validation

## 📁 Project Structure

```
nextjs-shadcn-templated-prompt/
├── src/
│   ├── app/
│   │   ├── api/generate/        # API route for OpenAI integration
│   │   │   └── route.ts         # Server-side OpenAI API calls
│   │   ├── globals.css          # Global styles with CSS variables
│   │   ├── layout.tsx           # Root layout component
│   │   └── page.tsx             # Main page component
│   ├── components/ui/           # Shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   └── textarea.tsx
│   └── lib/
│       └── utils.ts             # Utility functions
├── env.example                  # Environment variables template
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## 🎨 Design Features

- **Gradient Backgrounds**: Beautiful color transitions
- **Glass Morphism**: Semi-transparent cards with backdrop blur
- **Smooth Animations**: Hover effects and transitions
- **Consistent Spacing**: Well-structured layout with proper spacing
- **Accessible Colors**: High contrast ratios for readability
- **Responsive Grid**: Adapts to different screen sizes

## 🔧 Environment Configuration

The app uses environment variables for OpenAI configuration:

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional (with defaults shown)
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=500
OPENAI_TEMPERATURE=0.7
```

### Security Benefits

- **Server-side API calls**: API key never exposed to the client
- **Environment variables**: Secure configuration management
- **No client-side secrets**: Enhanced security posture
- **Error handling**: User-friendly error messages without exposing internals

## 🔧 Customization

### Adding New STM Fields

1. **Update the form state:**
   ```typescript
   const [formData, setFormData] = useState({
     // existing fields...
     newField: ''
   })
   ```

2. **Add form input:**
   ```tsx
   <div className="space-y-2">
     <Label htmlFor="newField">New Field</Label>
     <Input
       id="newField"
       value={formData.newField}
       onChange={(e) => handleInputChange('newField', e.target.value)}
     />
   </div>
   ```

3. **Use in templates:**
   ```
   Your template with {newField} injection.
   ```

### Styling Customization

The app uses CSS variables defined in `globals.css`. You can customize:

- Colors: Modify the color variables
- Spacing: Adjust the container max-width
- Gradients: Change the gradient combinations
- Components: Customize individual Shadcn/ui components

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Deploy with one click

### Other Platforms

```bash
npm run build
npm start
```

Deploy the `.next` folder to your hosting provider.

## 🤝 Contributing

Feel free to submit issues and pull requests to improve this example!

## 📄 License

This example is part of the MindCache project and follows the same MIT license.

## 🔗 Links

- [MindCache Documentation](https://github.com/dh7/mindcache)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [OpenAI API](https://platform.openai.com/docs)
