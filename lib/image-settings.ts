import * as fs from 'fs';
import * as path from 'path';

export interface ImageGeneratorSettings {
  provider: 'comfyui' | 'nanobanana' | 'off';
  comfyuiServerUrl?: string;
  geminiApiKey?: string;
}

const SETTINGS_FILE = path.join(process.cwd(), 'db', 'image-settings.json');

const defaultSettings: ImageGeneratorSettings = {
  provider: 'off',
  comfyuiServerUrl: '',
  geminiApiKey: '',
};

export function loadImageSettingsFromFile(): ImageGeneratorSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error('Error loading image settings:', error);
  }
  return defaultSettings;
}

export function saveImageSettingsToFile(settings: ImageGeneratorSettings): void {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving image settings:', error);
    throw error;
  }
}
