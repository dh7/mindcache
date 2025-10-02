import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Extended duration for image processing

export const POST = async (req: NextRequest) => {
  try {
    console.log('🚀 Image API called');
    const { 
      imageBase64, 
      images, // Array of base64 images for multi-image support
      prompt, 
      seed = -1, 
      promptUpsampling = false, 
      safetyTolerance = 2,
      aspectRatio = "1:1"
    } = await req.json();
    
    // Check if we have images to determine behavior
    const hasImages = imageBase64 || (images && images.length > 0);
    
    console.log('📝 Request params:', { 
      hasImages,
      prompt: prompt?.substring(0, 100) + '...', 
      hasImageBase64: !!imageBase64,
      imagesCount: images?.length || 0,
      seed,
      aspectRatio
    });

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
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

    // Prepare request body
    const requestBody: any = {
      prompt,
      seed,
    };

    // Add images if provided
    if (hasImages) {
      if (images && images.length > 0) {
        // Multiple images - send as array
        requestBody.input_image = images.map((img: string) => 
          img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
        );
      } else if (imageBase64) {
        // Single image - maintain backward compatibility
        requestBody.input_image = imageBase64.startsWith('data:') 
          ? imageBase64 
          : `data:image/jpeg;base64,${imageBase64}`;
      }
      requestBody.prompt_upsampling = promptUpsampling;
      requestBody.safety_tolerance = safetyTolerance;
    } else {
      // No images provided - generation mode
      requestBody.aspect_ratio = aspectRatio;
    }

    // Submit the request
    console.log('🔥 Sending request to Fireworks API:', { 
      endpoint: 'flux-kontext-pro',
      bodyKeys: Object.keys(requestBody),
      bodySize: JSON.stringify(requestBody).length
    });
    
    const response = await fetch(
      "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": hasImages ? "image/jpeg" : "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Fireworks API error:', { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      });
      return NextResponse.json(
        { error: `Fireworks API error: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Fireworks API response:', { 
      hasRequestId: !!result.request_id,
      requestId: result.request_id,
      keys: Object.keys(result)
    });

    if (!result.request_id) {
      console.error('❌ No request_id in response:', result);
      return NextResponse.json(
        { error: 'No request_id received from Fireworks API' },
        { status: 500 }
      );
    }

    // Poll for completion
    const resultEndpoint = "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result";
    console.log('⏳ Starting polling for request:', result.request_id);
    
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
        console.log(`🔄 Poll attempt ${attempts + 1}:`, { 
          status: pollResult.status,
          hasResult: !!pollResult.result,
          hasSample: !!pollResult.result?.sample
        });
        
        if (['Ready', 'Complete', 'Finished'].includes(pollResult.status)) {
          const imageData = pollResult.result?.sample;
          console.log('🎯 Image ready!', { 
            dataType: typeof imageData,
            isUrl: typeof imageData === 'string' && imageData.startsWith('http'),
            dataLength: typeof imageData === 'string' ? imageData.length : 'not string'
          });
          
          if (imageData) {
            let imageBuffer: ArrayBuffer;
            
            if (typeof imageData === 'string' && imageData.startsWith('http')) {
              // Fetch the image from URL
              console.log('📥 Fetching image from URL:', imageData.substring(0, 100) + '...');
              try {
                const imageResponse = await fetch(imageData);
                if (imageResponse.ok) {
                  imageBuffer = await imageResponse.arrayBuffer();
                  console.log('✅ Image fetched successfully, size:', imageBuffer.byteLength);
                } else {
                  console.error('❌ Failed to fetch image:', imageResponse.status, imageResponse.statusText);
                  return NextResponse.json(
                    { error: `Failed to fetch image from URL: ${imageResponse.status}` },
                    { status: 500 }
                  );
                }
              } catch (fetchError) {
                console.error('❌ Fetch error:', fetchError);
                return NextResponse.json(
                  { error: `Failed to fetch image: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` },
                  { status: 500 }
                );
              }
            } else {
              // Convert base64 to buffer
              console.log('🔄 Converting base64 to buffer, length:', imageData.length);
              imageBuffer = Buffer.from(imageData, 'base64').buffer;
              console.log('✅ Base64 converted, buffer size:', imageBuffer.byteLength);
            }
            
            // Return the image as binary data with proper headers
            console.log('🚀 Returning image, size:', imageBuffer.byteLength);
            return new NextResponse(imageBuffer, {
              status: 200,
              headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': imageBuffer.byteLength.toString(),
                'X-Request-ID': result.request_id || '',
                'X-Has-Images': String(hasImages),
                'X-Input-Count': String(images?.length || (imageBase64 ? 1 : 0))
              }
            });
          }
        }
        
        if (['Failed', 'Error'].includes(pollResult.status)) {
          console.error('❌ Generation failed:', { 
            status: pollResult.status,
            details: pollResult.details,
            fullResult: pollResult
          });
          return NextResponse.json(
            { error: `Generation failed: ${pollResult.details}` },
            { status: 500 }
          );
        }
        
        if (pollResult.status === 'Request Moderated') {
          console.warn('⚠️ Request moderated:', { requestId: result.request_id });
          return NextResponse.json(
            { error: 'Request was blocked by content moderation. Please try a different prompt or image.' },
            { status: 400 }
          );
        }
      } else {
        console.error('❌ Poll request failed:', resultResponse.status, resultResponse.statusText);
      }
    }

    // Timeout after 60 attempts
    console.error('⏰ Request timed out after 60 seconds');
    return NextResponse.json(
      { error: 'Request timed out after 60 seconds' },
      { status: 408 }
    );

  } catch (error) {
    console.error('💥 Image edit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
