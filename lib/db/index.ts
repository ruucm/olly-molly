'use client';

import { isAuthRequired } from '@/lib/auth-config';
import { SupabaseProvider } from './supabase-provider';
import type { DatabaseProvider } from './types';

// Re-export types
export * from './types';

// For local mode, we use the existing client-db.ts
// This file provides the abstraction for switching between modes

let provider: DatabaseProvider | null = null;

export function getDbProvider(): DatabaseProvider | null {
  return provider;
}

export function setDbProvider(p: DatabaseProvider): void {
  provider = p;
}

export function createDbProvider(): DatabaseProvider {
  if (isAuthRequired()) {
    return new SupabaseProvider();
  }
  // For local mode, return null - use client-db.ts directly
  throw new Error('Local mode should use client-db.ts directly');
}

export function useCloudMode(): boolean {
  return isAuthRequired();
}
