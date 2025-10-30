import { NextRequest, NextResponse } from 'next/server';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

export const maxDuration = 60;

export const POST = async (req: NextRequest) => {
  let tempDir: string | null = null;
  
  try {
    const { mermaidCode } = await req.json();

    if (!mermaidCode) {
      return NextResponse.json(
        { error: 'Missing required field: mermaidCode' },
        { status: 400 }
      );
    }

    // Add theme configuration if not already present
    let finalMermaidCode = mermaidCode.trim();
    if (!finalMermaidCode.includes('%%{init:')) {
      const themeConfig = `%%{init: {'theme':'neutral', 'themeVariables': { 'primaryColor':'#1f2937','primaryTextColor':'#fff','primaryBorderColor':'#374151','lineColor':'#6b7280','secondaryColor':'#374151','tertiaryColor':'#4b5563'}}}%%\n`;
      finalMermaidCode = themeConfig + finalMermaidCode;
    }

    // Create temp directory and write mermaid file
    tempDir = mkdtempSync(join(tmpdir(), 'mermaid-'));
    const mmdPath = join(tempDir, 'diagram.mmd');
    const pngPath = join(tempDir, 'diagram.png');
    
    writeFileSync(mmdPath, finalMermaidCode, 'utf8');

    // Convert Mermaid directly to PNG using mermaid-cli
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
      npxCmd,
      ['@mermaid-js/mermaid-cli', '-i', mmdPath, '-o', pngPath],
      { stdio: 'pipe' }
    );

    if (result.status !== 0) {
      const error = result.stderr?.toString() || result.stdout?.toString() || 'Mermaid conversion failed';
      console.error('Mermaid conversion error:', error);
      return NextResponse.json(
        { error: `Failed to generate diagram: ${error}` },
        { status: 500 }
      );
    }

    // Read the generated PNG
    const pngBuffer = readFileSync(pngPath);

    // Return the image (convert Buffer to ArrayBuffer)
    const arrayBuffer = pngBuffer.buffer.slice(
      pngBuffer.byteOffset,
      pngBuffer.byteOffset + pngBuffer.byteLength
    ) as ArrayBuffer;
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': pngBuffer.length.toString(),
      }
    });

  } catch (error) {
    console.error('Mermaid to image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }
};

