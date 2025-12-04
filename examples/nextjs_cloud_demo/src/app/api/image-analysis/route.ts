import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Image Analysis API called');
    
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const prompt = formData.get('prompt') as string || "Analyze this image and describe what you see in detail.";

    console.log('📝 Request params:', {
      hasImage: !!imageFile,
      prompt: prompt.substring(0, 100) + '...',
      imageType: imageFile?.type,
      imageSize: imageFile?.size
    });

    if (!imageFile) {
      return NextResponse.json(
        { error: 'Image file is required' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log('🖼️ Processing image file');
    
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${imageFile.type};base64,${base64Image}`;

    console.log('🤖 Calling OpenAI Vision API');

    const result = await generateObject({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: dataUrl }
          ]
        }
      ],
      schema: z.object({
        analysis: z.string().describe('Detailed analysis of the image based on the prompt'),
      })
    });

    console.log('✅ Analysis completed:', {
      hasAnalysis: !!result.object.analysis
    });

    return NextResponse.json({
      success: true,
      data: {
        analysis: result.object.analysis,
        prompt: prompt,
        imageInfo: {
          type: imageFile.type,
          size: imageFile.size,
          name: imageFile.name
        }
      }
    });

  } catch (error) {
    console.error('❌ Image analysis error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred while analyzing the image',
        success: false
      },
      { status: 500 }
    );
  }
}

