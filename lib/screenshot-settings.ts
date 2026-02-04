import * as fs from 'fs';
import * as path from 'path';

export interface ScreenshotTestSettings {
  enabled: boolean;
}

const SETTINGS_FILE = path.join(process.cwd(), 'db', 'screenshot-settings.json');

const defaultSettings: ScreenshotTestSettings = {
  enabled: false, // 기본값: 비활성화
};

export function loadScreenshotSettingsFromFile(): ScreenshotTestSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error('Error loading screenshot settings:', error);
  }
  return defaultSettings;
}

export function saveScreenshotSettingsToFile(settings: ScreenshotTestSettings): void {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving screenshot settings:', error);
    throw error;
  }
}
