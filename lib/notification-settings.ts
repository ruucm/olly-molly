// Client-side notification settings stored in localStorage

export interface NotificationSettings {
    browserEnabled: boolean;
    emailEnabled: boolean;
    emailAddress: string;
}

const STORAGE_KEY = 'notification-settings';

const DEFAULT_SETTINGS: NotificationSettings = {
    browserEnabled: true,
    emailEnabled: false,
    emailAddress: '',
};

export function getNotificationSettings(): NotificationSettings {
    if (typeof window === 'undefined') {
        return DEFAULT_SETTINGS;
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_SETTINGS;

        const parsed = JSON.parse(stored);
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveNotificationSettings(settings: Partial<NotificationSettings>): NotificationSettings {
    const current = getNotificationSettings();
    const updated = { ...current, ...settings };

    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }

    return updated;
}

export function isEmailNotificationEnabled(): boolean {
    const settings = getNotificationSettings();
    return settings.emailEnabled && !!settings.emailAddress;
}

export function getEmailAddress(): string {
    const settings = getNotificationSettings();
    return settings.emailAddress;
}
