/**
 * Authentication configuration utilities
 */

/**
 * Check if authentication is required based on environment
 */
export function isAuthRequired(): boolean {
  // Check environment variable first
  if (process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'false') {
    return false;
  }

  // In browser, also check hostname for local development
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Allow localhost and 127.0.0.1 without auth when env is not explicitly set
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true';
    }
  }

  // Default to requiring auth in production
  return process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false';
}

/**
 * Check if we should use Supabase (cloud) or IndexedDB (local)
 */
export function useSupabaseDb(): boolean {
  // Only use Supabase when auth is required (i.e., deployed environment)
  return isAuthRequired();
}

/**
 * Get the current environment mode
 */
export function getEnvironmentMode(): 'local' | 'cloud' {
  return isAuthRequired() ? 'cloud' : 'local';
}
