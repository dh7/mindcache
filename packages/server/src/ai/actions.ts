/**
 * Action APIs
 * 
 * Pre-built endpoints that read from and write to MindCache:
 * - /api/transform - LLM transforms template to output
 * - /api/generate-image - Generate image with Fireworks flux-kontext-pro
 * - /api/analyze-image - Analyze image with GPT-4 Vision
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { KeyAttributes, KeyEntry } from '@mindcache/shared';

export interface ActionEnv {
  OPENAI_API_KEY?: string;
  FIREWORKS_API_KEY?: string;
  MINDCACHE_INSTANCE: DurableObjectNamespace;
}

interface InstanceData {
  [key: string]: KeyEntry;
}

/**
 * Fetch current instance data directly from the Durable Object via HTTP
 */
async function fetchInstanceData(
  env: ActionEnv,
  instanceId: string
): Promise<InstanceData> {
  const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
  const stub = env.MINDCACHE_INSTANCE.get(id);
  
  const response = await stub.fetch(new Request('http://internal/keys'));
  if (!response.ok) {
    throw new Error('Failed to fetch instance data');
  }
  return response.json();
}

/**
 * Get a key value from instance data
 */
async function getKeyValue(
  env: ActionEnv,
  instanceId: string,
  key: string
): Promise<unknown> {
  const data = await fetchInstanceData(env, instanceId);
  const entry = data[key];
  if (!entry) {
    throw new Error(`Key "${key}" not found`);
  }
  return entry.value;
}

/**
 * Set a key in the Durable Object via HTTP
 */
async function setInstanceKey(
  env: ActionEnv,
  instanceId: string,
  key: string,
  value: unknown,
  attributes: KeyAttributes
): Promise<void> {
  const id = env.MINDCACHE_INSTANCE.idFromName(instanceId);
  const stub = env.MINDCACHE_INSTANCE.get(id);
  
  const response = await stub.fetch(new Request('http://internal/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, attributes }),
  }));
  
  if (!response.ok) {
    throw new Error('Failed to set key');
  }
}

/**
 * Resolve template variables: {{key}} → value from instance
 */
function resolveTemplate(template: string, data: InstanceData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const entry = data[key];
    if (!entry) return `{{${key}}}`; // Keep unresolved
    return typeof entry.value === 'string' 
      ? entry.value 
      : JSON.stringify(entry.value);
  });
}

// =============================================================================
// Transform API
// =============================================================================

export interface TransformRequest {
  instanceId: string;
  template?: string;        // Template with {{key}} variables
  templateKey?: string;     // OR key containing the template
  outputKey: string;        // Key to store result
  prompt?: string;          // Additional instructions for the transform
  promptKey?: string;       // OR key containing the prompt
  model?: string;
}

export async function handleTransformRequest(
  request: Request,
  env: ActionEnv
): Promise<Response> {
  try {
    const body = await request.json() as TransformRequest;
    const { instanceId, template, templateKey, outputKey, prompt, promptKey, model = 'gpt-4o-mini' } = body;

    // Validate required fields first
    if (!instanceId || !outputKey) {
      return Response.json(
        { error: 'instanceId and outputKey required' },
        { status: 400 }
      );
    }

    if (!template && !templateKey) {
      return Response.json(
        { error: 'Either template or templateKey required' },
        { status: 400 }
      );
    }

    // Then check API key
    if (!env.OPENAI_API_KEY) {
      return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Fetch instance data
    const data = await fetchInstanceData(env, instanceId);

    // Get template (from key or direct)
    let templateText = template;
    if (templateKey) {
      const entry = data[templateKey];
      if (!entry) {
        return Response.json({ error: `Template key "${templateKey}" not found` }, { status: 404 });
      }
      templateText = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
    }

    // Get prompt (from key or direct)
    let promptText = prompt;
    if (promptKey) {
      const entry = data[promptKey];
      if (entry) {
        promptText = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
      }
    }

    // Resolve template variables
    const resolvedTemplate = resolveTemplate(templateText!, data);

    // Create OpenAI provider
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

    // Generate transformed text
    const result = await generateText({
      model: openai(model),
      prompt: promptText 
        ? `${promptText}\n\nInput:\n${resolvedTemplate}`
        : resolvedTemplate,
    });

    // Store result in output key
    await setInstanceKey(env, instanceId, outputKey, result.text, {
      readonly: false,
      visible: true,
      hardcoded: false,
      template: false,
      type: 'text',
      tags: ['generated'],
    });

    return Response.json({
      success: true,
      outputKey,
      result: result.text,
    });
  } catch (error) {
    console.error('Transform error:', error);
    return Response.json(
      { error: 'Transform failed', details: String(error) },
      { status: 500 }
    );
  }
}

// =============================================================================
// Generate Image API (Fireworks flux-kontext-pro)
// =============================================================================

export interface GenerateImageRequest {
  instanceId: string;
  prompt?: string;          // Direct prompt
  promptKey?: string;       // OR key containing the prompt
  outputKey: string;        // Key to store the image (base64)
  // Optional source images for editing
  imageKey?: string;        // Key containing source image (base64)
  imageKeys?: string[];     // Multiple source images
  // Fireworks options
  seed?: number;
  aspectRatio?: string;
  safetyTolerance?: number;
}

export async function handleGenerateImageRequest(
  request: Request,
  env: ActionEnv
): Promise<Response> {
  try {
    const body = await request.json() as GenerateImageRequest;
    const { 
      instanceId, 
      prompt: directPrompt, 
      promptKey,
      outputKey, 
      imageKey,
      imageKeys,
      seed = -1,
      aspectRatio = '1:1',
      safetyTolerance = 2,
    } = body;

    // Validate required fields first
    if (!instanceId || !outputKey) {
      return Response.json(
        { error: 'instanceId and outputKey required' },
        { status: 400 }
      );
    }

    if (!directPrompt && !promptKey) {
      return Response.json(
        { error: 'Either prompt or promptKey required' },
        { status: 400 }
      );
    }

    // Then check API key
    if (!env.FIREWORKS_API_KEY) {
      return Response.json({ error: 'Fireworks API key not configured' }, { status: 500 });
    }

    // Get prompt
    let imagePrompt = directPrompt;
    if (promptKey) {
      imagePrompt = String(await getKeyValue(env, instanceId, promptKey));
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      prompt: imagePrompt,
      seed,
    };

    // Get source images if provided (for editing)
    const images: string[] = [];
    if (imageKey) {
      const imgValue = await getKeyValue(env, instanceId, imageKey);
      if (typeof imgValue === 'string') {
        images.push(imgValue.startsWith('data:') ? imgValue : `data:image/jpeg;base64,${imgValue}`);
      }
    }
    if (imageKeys && imageKeys.length > 0) {
      for (const key of imageKeys) {
        const imgValue = await getKeyValue(env, instanceId, key);
        if (typeof imgValue === 'string') {
          images.push(imgValue.startsWith('data:') ? imgValue : `data:image/jpeg;base64,${imgValue}`);
        }
      }
    }

    if (images.length > 0) {
      requestBody.input_image = images.length === 1 ? images[0] : images;
      requestBody.prompt_upsampling = false;
      requestBody.safety_tolerance = safetyTolerance;
    } else {
      requestBody.aspect_ratio = aspectRatio;
    }

    // Submit request to Fireworks
    const response = await fetch(
      'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: `Fireworks API error: ${errorText}` }, { status: 500 });
    }

    const submitResult = await response.json() as { request_id?: string };
    if (!submitResult.request_id) {
      return Response.json({ error: 'No request_id from Fireworks' }, { status: 500 });
    }

    // Poll for completion
    const resultEndpoint = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result';
    
    for (let attempts = 0; attempts < 60; attempts++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const resultResponse = await fetch(resultEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/jpeg',
          'Authorization': `Bearer ${env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify({ id: submitResult.request_id }),
      });

      if (resultResponse.ok) {
        const pollResult = await resultResponse.json() as { 
          status: string; 
          result?: { sample?: string };
          details?: string;
        };

        if (['Ready', 'Complete', 'Finished'].includes(pollResult.status)) {
          const imageData = pollResult.result?.sample;
          if (imageData) {
            // If URL, fetch and convert to base64
            let base64Image: string;
            if (typeof imageData === 'string' && imageData.startsWith('http')) {
              const imgResponse = await fetch(imageData);
              const arrayBuffer = await imgResponse.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Image = `data:image/jpeg;base64,${btoa(binary)}`;
            } else {
              base64Image = imageData.startsWith('data:') 
                ? imageData 
                : `data:image/jpeg;base64,${imageData}`;
            }

            // Store in MindCache
            await setInstanceKey(env, instanceId, outputKey, base64Image, {
              readonly: false,
              visible: true,
              hardcoded: false,
              template: false,
              type: 'image',
              contentType: 'image/jpeg',
              tags: ['generated', 'fireworks'],
            });

            return Response.json({
              success: true,
              outputKey,
              // Don't return full base64 in response, just confirm it was saved
              message: 'Image generated and saved to MindCache',
            });
          }
        }

        if (['Failed', 'Error'].includes(pollResult.status)) {
          return Response.json(
            { error: `Generation failed: ${pollResult.details}` },
            { status: 500 }
          );
        }

        if (pollResult.status === 'Request Moderated') {
          return Response.json(
            { error: 'Request blocked by content moderation' },
            { status: 400 }
          );
        }
      }
    }

    return Response.json({ error: 'Request timed out' }, { status: 408 });
  } catch (error) {
    console.error('Generate image error:', error);
    return Response.json(
      { error: 'Image generation failed', details: String(error) },
      { status: 500 }
    );
  }
}

// =============================================================================
// Analyze Image API (GPT-4 Vision)
// =============================================================================

export interface AnalyzeImageRequest {
  instanceId: string;
  imageKey?: string;        // Key containing the image (base64 or URL)
  imageUrl?: string;        // Direct image URL
  imageBase64?: string;     // Direct base64 image
  prompt?: string;          // Analysis prompt
  promptKey?: string;       // OR key containing the prompt
  outputKey: string;        // Key to store the analysis
  model?: string;
}

export async function handleAnalyzeImageRequest(
  request: Request,
  env: ActionEnv
): Promise<Response> {
  try {
    const body = await request.json() as AnalyzeImageRequest;
    const { 
      instanceId, 
      imageKey, 
      imageUrl: directUrl, 
      imageBase64,
      prompt: directPrompt,
      promptKey,
      outputKey,
      model = 'gpt-4o'
    } = body;

    // Validate required fields first
    if (!instanceId || !outputKey) {
      return Response.json(
        { error: 'instanceId and outputKey required' },
        { status: 400 }
      );
    }

    if (!imageKey && !directUrl && !imageBase64) {
      return Response.json(
        { error: 'One of imageKey, imageUrl, or imageBase64 required' },
        { status: 400 }
      );
    }

    if (!directPrompt && !promptKey) {
      return Response.json(
        { error: 'Either prompt or promptKey required' },
        { status: 400 }
      );
    }

    // Then check API key
    if (!env.OPENAI_API_KEY) {
      return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Get image
    let imageForApi: string;
    if (imageKey) {
      const imgValue = await getKeyValue(env, instanceId, imageKey);
      imageForApi = typeof imgValue === 'string' ? imgValue : String(imgValue);
    } else if (imageBase64) {
      imageForApi = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:image/jpeg;base64,${imageBase64}`;
    } else {
      imageForApi = directUrl!;
    }

    // Get prompt
    let analysisPrompt = directPrompt;
    if (promptKey) {
      analysisPrompt = String(await getKeyValue(env, instanceId, promptKey));
    }

    // Create OpenAI provider
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

    // Analyze with vision model
    const result = await generateText({
      model: openai(model),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt! },
            { type: 'image', image: imageForApi },
          ],
        },
      ],
    });

    // Store result in output key
    await setInstanceKey(env, instanceId, outputKey, result.text, {
      readonly: false,
      visible: true,
      hardcoded: false,
      template: false,
      type: 'text',
      tags: ['generated', 'vision-analysis'],
    });

    return Response.json({
      success: true,
      outputKey,
      analysis: result.text,
    });
  } catch (error) {
    console.error('Analyze image error:', error);
    return Response.json(
      { error: 'Image analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}
