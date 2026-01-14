import * as fs from 'fs';
import * as path from 'path';

// Workflow file path for ComfyUI
const WORKFLOW_PATH = path.join(process.cwd(), 'lib/comfy-workflows/image_z_image_turbo.json');

export interface ImageGeneratorSettings {
    provider: 'comfyui' | 'nanobanana' | 'off';
    comfyuiServerUrl?: string;
    geminiApiKey?: string;
}

export interface GenerateImageParams {
    prompt: string;
    width?: number;
    height?: number;
    projectPath?: string;
    settings: ImageGeneratorSettings;
}

export interface GenerateImageResult {
    success: boolean;
    imageUrl?: string;
    savedPath?: string;
    error?: string;
}

interface ComfyWorkflow {
    [key: string]: {
        inputs: Record<string, unknown>;
        class_type: string;
        _meta?: { title: string };
    };
}

// ============ ComfyUI Functions ============

function loadWorkflow(): ComfyWorkflow {
    const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    return JSON.parse(workflowContent);
}

function modifyWorkflow(
    workflow: ComfyWorkflow,
    prompt: string,
    width: number,
    height: number
): ComfyWorkflow {
    const modified = JSON.parse(JSON.stringify(workflow));

    // Set prompt text (node "58")
    if (modified['58']) {
        modified['58'].inputs.value = prompt;
    }

    // Set image dimensions (node "57:13")
    if (modified['57:13']) {
        modified['57:13'].inputs.width = width;
        modified['57:13'].inputs.height = height;
    }

    // Set random seed
    if (modified['57:3']) {
        modified['57:3'].inputs.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }

    return modified;
}

async function queuePrompt(serverUrl: string, workflow: ComfyWorkflow): Promise<{ prompt_id: string }> {
    const response = await fetch(`${serverUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to queue prompt: ${response.status} ${errorText}`);
    }

    return response.json();
}

async function waitForComfyResult(serverUrl: string, promptId: string, maxWaitMs: number = 120000): Promise<string[]> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(`${serverUrl}/history/${promptId}`);

            if (response.ok) {
                const history = await response.json();

                if (history[promptId]?.outputs) {
                    const outputs = history[promptId].outputs;
                    const imageFilenames: string[] = [];

                    for (const nodeId of Object.keys(outputs)) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.images) {
                            for (const img of nodeOutput.images) {
                                imageFilenames.push(img.filename);
                            }
                        }
                    }

                    if (imageFilenames.length > 0) {
                        return imageFilenames;
                    }
                }
            }
        } catch (error) {
            console.error('Error polling history:', error);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Timeout waiting for image generation');
}

async function downloadComfyImage(serverUrl: string, filename: string): Promise<Buffer> {
    const response = await fetch(`${serverUrl}/view?filename=${encodeURIComponent(filename)}`);

    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function generateWithComfyUI(
    serverUrl: string,
    prompt: string,
    width: number,
    height: number
): Promise<{ imageUrl: string; imageBuffer?: Buffer }> {
    const workflow = loadWorkflow();
    const modifiedWorkflow = modifyWorkflow(workflow, prompt, width, height);

    const { prompt_id } = await queuePrompt(serverUrl, modifiedWorkflow);
    console.log(`ComfyUI: Queued prompt ${prompt_id}`);

    const imageFilenames = await waitForComfyResult(serverUrl, prompt_id);

    if (imageFilenames.length === 0) {
        throw new Error('No images generated');
    }

    const filename = imageFilenames[0];
    const imageUrl = `${serverUrl}/view?filename=${encodeURIComponent(filename)}`;
    const imageBuffer = await downloadComfyImage(serverUrl, filename);

    return { imageUrl, imageBuffer };
}

export async function checkComfyServer(serverUrl: string): Promise<boolean> {
    try {
        const response = await fetch(`${serverUrl}/system_stats`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

// ============ NanoBanana (Gemini) Functions ============

async function generateWithNanoBanana(
    apiKey: string,
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _width: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _height: number
): Promise<{ imageUrl: string; imageBuffer: Buffer }> {
    const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `Generate an image: ${prompt}` }]
                }],
                generationConfig: {
                    responseModalities: ['image', 'text'],
                },
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NanoBanana API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Find image part in response
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                const base64Data = part.inlineData.data;
                const imageBuffer = Buffer.from(base64Data, 'base64');
                // Return a data URL for immediate display
                const imageUrl = `data:${part.inlineData.mimeType};base64,${base64Data}`;
                return { imageUrl, imageBuffer };
            }
        }
    }

    throw new Error('No image in NanoBanana response');
}

// ============ Common Functions ============

function saveImageToProject(imageBuffer: Buffer, projectPath: string, prefix: string = 'generated'): string {
    const generatedDir = path.join(projectPath, 'public', 'generated');

    if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.png`;
    const savePath = path.join(generatedDir, filename);

    fs.writeFileSync(savePath, imageBuffer);

    return savePath;
}

// ============ Main Generate Function ============

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    const { prompt, width = 1024, height = 1024, projectPath, settings } = params;

    if (settings.provider === 'off') {
        return { success: false, error: 'Image generation is disabled' };
    }

    try {
        let imageUrl: string;
        let imageBuffer: Buffer | undefined;

        if (settings.provider === 'comfyui') {
            if (!settings.comfyuiServerUrl) {
                return { success: false, error: 'ComfyUI server URL not configured' };
            }

            const result = await generateWithComfyUI(settings.comfyuiServerUrl, prompt, width, height);
            imageUrl = result.imageUrl;
            imageBuffer = result.imageBuffer;

        } else if (settings.provider === 'nanobanana') {
            if (!settings.geminiApiKey) {
                return { success: false, error: 'Gemini API key not configured' };
            }

            const result = await generateWithNanoBanana(settings.geminiApiKey, prompt, width, height);
            imageUrl = result.imageUrl;
            imageBuffer = result.imageBuffer;

        } else {
            return { success: false, error: 'Unknown provider' };
        }

        // Save to project if path provided
        let savedPath: string | undefined;
        if (projectPath && imageBuffer) {
            savedPath = saveImageToProject(imageBuffer, projectPath, settings.provider);
            console.log(`Image saved to: ${savedPath}`);
        }

        return { success: true, imageUrl, savedPath };

    } catch (error) {
        console.error('Error generating image:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
