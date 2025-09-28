import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Extended duration for image processing

export const POST = async (req: NextRequest) => {
  try {
    const { 
      imageBase64, 
      prompt, 
      seed = -1, 
      promptUpsampling = false, 
      safetyTolerance = 2,
      aspectRatio = "1:1",
      mode = "edit" // "edit" or "generate"
    } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 }
      );
    }

    // For edit mode, imageBase64 is required
    if (mode === "edit" && !imageBase64) {
      return NextResponse.json(
        { error: 'Missing required field for edit mode: imageBase64' },
        { status: 400 }
      );
    }

    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'FIREWORKS_API_KEY environment variable not set' },
        { status: 500 }
      );
    }

    // Prepare request body based on mode
    const requestBody: any = {
      prompt,
      seed,
    };

    if (mode === "edit") {
      // Image editing mode
      requestBody.input_image = `data:image/jpeg;base64,${imageBase64}`;
      requestBody.prompt_upsampling = promptUpsampling;
      requestBody.safety_tolerance = safetyTolerance;
    } else {
      // Image generation mode
      requestBody.aspect_ratio = aspectRatio;
    }

    // Submit the request
    const response = await fetch(
      "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": mode === "generate" ? "application/json" : "image/jpeg",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Fireworks API error: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();

    if (!result.request_id) {
      return NextResponse.json(
        { error: 'No request_id received from Fireworks API' },
        { status: 500 }
      );
    }

    // Poll for completion
    const resultEndpoint = "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result";
    
    for (let attempts = 0; attempts < 60; attempts++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const resultResponse = await fetch(resultEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "image/jpeg",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ id: result.request_id })
      });

      if (resultResponse.ok) {
        const pollResult = await resultResponse.json();
        
        if (['Ready', 'Complete', 'Finished'].includes(pollResult.status)) {
          const imageData = pollResult.result?.sample;
          if (imageData) {
            if (typeof imageData === 'string' && imageData.startsWith('http')) {
              return NextResponse.json({ 
                success: true, 
                imageUrl: imageData,
                requestId: result.request_id,
                mode
              });
            } else {
              // Return base64 image data
              return NextResponse.json({ 
                success: true, 
                imageBase64: imageData,
                requestId: result.request_id,
                mode
              });
            }
          }
        }
        
        if (['Failed', 'Error'].includes(pollResult.status)) {
          return NextResponse.json(
            { error: `Generation failed: ${pollResult.details}` },
            { status: 500 }
          );
        }
      }
    }

    // Timeout after 60 attempts
    return NextResponse.json(
      { error: 'Request timed out after 60 seconds' },
      { status: 408 }
    );

  } catch (error) {
    console.error('Image edit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
