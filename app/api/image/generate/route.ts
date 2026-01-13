import { NextRequest, NextResponse } from 'next/server';
import { generateImage, checkComfyServer } from '@/lib/image-client';
import { ImageGeneratorSettings, loadImageSettingsFromFile } from '@/lib/image-settings';

interface GenerateRequest {
    prompt: string;
    width?: number;
    height?: number;
    projectPath?: string;
}

function parseSettings(request: NextRequest): ImageGeneratorSettings | null {
    // First try to get settings from header (for frontend calls with fresh settings)
    const settingsHeader = request.headers.get('X-Image-Settings');
    if (settingsHeader) {
        try {
            return JSON.parse(settingsHeader);
        } catch {
            // Fall through to file-based settings
        }
    }

    // Fall back to file-based settings (for CLI agent calls)
    return loadImageSettingsFromFile();
}

export async function POST(request: NextRequest) {
    try {
        const settings = parseSettings(request);

        if (!settings || settings.provider === 'off') {
            return NextResponse.json(
                { success: false, error: 'Image generation is not configured. Please configure it in Settings (⚙️ button in header).' },
                { status: 400 }
            );
        }

        const body: GenerateRequest = await request.json();

        if (!body.prompt) {
            return NextResponse.json(
                { success: false, error: 'prompt is required' },
                { status: 400 }
            );
        }

        // Check ComfyUI server availability if using ComfyUI
        if (settings.provider === 'comfyui' && settings.comfyuiServerUrl) {
            const serverAvailable = await checkComfyServer(settings.comfyuiServerUrl);
            if (!serverAvailable) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `ComfyUI server is not available at ${settings.comfyuiServerUrl}. Please ensure the server is running.`
                    },
                    { status: 503 }
                );
            }
        }

        // Generate the image
        const result = await generateImage({
            prompt: body.prompt,
            width: body.width,
            height: body.height,
            projectPath: body.projectPath,
            settings,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            imageUrl: result.imageUrl,
            savedPath: result.savedPath,
            provider: settings.provider,
            message: result.savedPath
                ? `Image generated and saved to ${result.savedPath}`
                : 'Image generated successfully',
        });
    } catch (error) {
        console.error('Error in /api/image/generate:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate image'
            },
            { status: 500 }
        );
    }
}

// GET endpoint to check service status
export async function GET(request: NextRequest) {
    const settings = parseSettings(request);

    if (!settings || settings.provider === 'off') {
        return NextResponse.json({
            enabled: false,
            provider: 'off',
        });
    }

    let available = false;

    if (settings.provider === 'comfyui' && settings.comfyuiServerUrl) {
        available = await checkComfyServer(settings.comfyuiServerUrl);
    } else if (settings.provider === 'nanobanana' && settings.geminiApiKey) {
        // Gemini API is generally available if API key is set
        available = true;
    }

    return NextResponse.json({
        enabled: true,
        provider: settings.provider,
        available,
    });
}
