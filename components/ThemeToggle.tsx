'use client';

import { useTheme } from './ThemeProvider';
import { Moon, Sun } from 'lucide-react';
import { Icon } from '@/components/ui';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors
                 bg-zinc-100 dark:bg-zinc-800 
                 text-zinc-600 dark:text-zinc-400 
                 hover:bg-zinc-200 dark:hover:bg-zinc-700
                 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            {theme === 'dark' ? (
                <Icon icon={Sun} className="w-4 h-4" />
            ) : (
                <Icon icon={Moon} className="w-4 h-4" />
            )}
        </button>
    );
}
