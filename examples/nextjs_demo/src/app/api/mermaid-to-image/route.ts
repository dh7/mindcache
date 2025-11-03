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
    
    // High-quality export settings - let Mermaid auto-size based on content
    const scale = 2;     // 2x scale for quality

    if (!mermaidCode) {
      return NextResponse.json(
        { error: 'Missing required field: mermaidCode' },
        { status: 400 }
      );
    }

    // Add handDrawn look configuration with custom styling
    let finalMermaidCode = mermaidCode.trim();
    if (!finalMermaidCode.startsWith('---') && !finalMermaidCode.includes('%%{init:')) {
      // Try both YAML frontmatter (newer) and init directive (legacy) for compatibility
      const handDrawnConfig = `---
config:
  look: handDrawn
  theme: base
  flowchart:
    rankSpacing: 60
    nodeSpacing: 80
    padding: 20
    diagramPadding: 20
    curve: basis
  themeVariables:
    fontFamily: 'Segoe Print, Bradley Hand, Marker Felt, Chalkboard, cursive'
    fontSize: 16px
    primaryColor: '#ffffff'
    primaryTextColor: '#000000'
    primaryBorderColor: '#000000'
    lineColor: '#000000'
    secondaryColor: '#f5f5f5'
    tertiaryColor: '#e5e5e5'
---
`;
      finalMermaidCode = handDrawnConfig + finalMermaidCode;
    }

    // Create temp directory and write mermaid file
    tempDir = mkdtempSync(join(tmpdir(), 'mermaid-'));
    const mmdPath = join(tempDir, 'diagram.mmd');
    const outputPath = join(tempDir, 'diagram.png');
    
    writeFileSync(mmdPath, finalMermaidCode, 'utf8');
    console.log('🎨 Mermaid config applied:', finalMermaidCode.substring(0, 200));
    console.log('📐 PNG scale: 2x (auto-sizing to content)');

    // Convert Mermaid to PNG using puppeteer (auto-size to content)
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
      npxCmd,
      [
        '@mermaid-js/mermaid-cli', 
        '-i', mmdPath, 
        '-o', outputPath, 
        '-b', 'puppeteer',
        '-s', String(scale)
      ],
      { stdio: 'pipe' }
    );

    // Log any warnings/errors from mermaid-cli
    const stderr = result.stderr?.toString();
    const stdout = result.stdout?.toString();
    if (stderr) console.log('⚠️ Mermaid stderr:', stderr);
    if (stdout) console.log('📝 Mermaid stdout:', stdout);

    if (result.status !== 0) {
      const error = stderr || stdout || 'Mermaid conversion failed';
      console.error('Mermaid conversion error:', error);
      return NextResponse.json(
        { error: `Failed to generate diagram: ${error}` },
        { status: 500 }
      );
    }

    // Read PNG with handDrawn look applied by mermaid-cli
    const pngContent = readFileSync(outputPath);
    
    console.log('📊 Generated PNG diagram, size:', pngContent.length, 'bytes');
    
    return new NextResponse(pngContent, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
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

