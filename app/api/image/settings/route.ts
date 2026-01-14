import { NextRequest, NextResponse } from 'next/server';
import {
    ImageGeneratorSettings,
    loadImageSettingsFromFile,
    saveImageSettingsToFile,
} from '@/lib/image-settings';

// GET - Load settings
export async function GET() {
    try {
        const settings = loadImageSettingsFromFile();
        return NextResponse.json(settings);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load settings' },
            { status: 500 }
        );
    }
}

// POST - Save settings
export async function POST(request: NextRequest) {
    try {
        const settings: ImageGeneratorSettings = await request.json();
        saveImageSettingsToFile(settings);
        return NextResponse.json({ success: true, settings });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save settings' },
            { status: 500 }
        );
    }
}
