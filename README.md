# MindCache

A TypeScript library for managing short-term memory in AI agents through a simple, LLM-friendly key-value repository.

MindCache aims to solve one of the fundamental challenges in AI agent development: **memory management**. As AI agents interact with users and process information, they need a way to store, retrieve, and reason about contextual data.

This library is opinionated and enforced good practices to ease and accelerate the development of AI agents.

Managing cross-session memory is out of scope for this library. This is for short-term memory only.

## Core Concepts

MindCache operates as an intelligent key-value repository designed specifically for AI agents:

- **Universal Storage**: Store any data type that an LLM can process - text, images, value of any kind.
- **LLM-Readable**: The storage format is optimized for LLM consumption, allowing agents to easily understand and reason about stored information
- **LLM-Writable**: Agents can directly read from and write to the memory store using simple tool calls
- **System Prompt Generation**: Automatically generate system prompts that summarize the entire memory state, giving your AI agent instant context
- **Markdown-Friendly**: Markdown is the preferred format for storing data.

## Integration & Compatibility

MindCache is built with modern web development in mind:

- **Vercel AI SDK**: Native compatibility with Vercel's AI SDK for seamless integration
- **Next.js Ready**: Drop-in support for Next.js projects with minimal configuration
- **Framework Agnostic**: Works with any TypeScript/JavaScript environment
- **Edge Compatible**: Designed to work in serverless and edge environments

## What's Included

This project will ship with:

- **Core Library**: The main MindCache TypeScript library
- **Documentation**: Comprehensive guides and API documentation  
- **Examples**: Multiple implementation examples including:
  - Next.js + Vercel AI SDK integration
  - Basic usage patterns
  - Advanced memory management strategies
  - Real-world use cases

## 🚧 Development Status

This project is currently in development. The readme file is just there to guide the AI that is writing the code.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.





