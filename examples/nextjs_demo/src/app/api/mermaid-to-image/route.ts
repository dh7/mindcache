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

    // Add handDrawn look configuration with custom styling
    let finalMermaidCode = mermaidCode.trim();
    if (!finalMermaidCode.startsWith('---')) {
      const handDrawnConfig = `---
config:
  look: handDrawn
  theme: base
  handDrawnSeed: ${Math.floor(Math.random() * 1000)}
  themeVariables:
    fontFamily: 'Segoe Print, Bradley Hand, Marker Felt, Chalkboard, cursive'
    fontSize: '16px'
    primaryColor: '#f9f9f9'
    primaryBorderColor: '#333'
    lineColor: '#333'
    strokeWidth: '2px'
---
`;
      finalMermaidCode = handDrawnConfig + finalMermaidCode;
    }

    // Create temp directory and write mermaid file
    tempDir = mkdtempSync(join(tmpdir(), 'mermaid-'));
    const mmdPath = join(tempDir, 'diagram.mmd');
    const outputPath = join(tempDir, 'diagram.svg');
    
    writeFileSync(mmdPath, finalMermaidCode, 'utf8');

    // Convert Mermaid to SVG
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
      npxCmd,
      ['@mermaid-js/mermaid-cli', '-i', mmdPath, '-o', outputPath],
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

    // Read SVG with handDrawn look applied by mermaid-cli
    const svgContent = readFileSync(outputPath, 'utf8');
    
    console.log('📊 Generated SVG diagram, length:', svgContent.length);
    
    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
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

