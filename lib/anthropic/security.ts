/**
 * Security utilities for Anthropic tool execution
 *
 * Prevents unauthorized access to files and dangerous commands
 */

import path from 'path';

// ─── Blocked File Patterns ────────────────────────────────────────────

const BLOCKED_FILE_PATTERNS = [
    // Environment and credentials
    /\.env$/,
    /\.env\.[^/]+$/,
    /credentials\.json$/,
    /secrets\.json$/,
    /\.pem$/,
    /\.key$/,
    /\.pfx$/,
    /\.p12$/,

    // Git internals (allow .gitignore, .gitattributes)
    /\.git\/(?!ignore|attributes)/,

    // SSH
    /\.ssh\//,
    /id_rsa/,
    /id_ed25519/,
    /id_ecdsa/,
    /known_hosts/,

    // Package manager lock files (allow reading, block writing)
    // Handled separately in write operations

    // AWS/Cloud credentials
    /\.aws\//,
    /\.azure\//,
    /\.gcloud\//,

    // NPM tokens
    /\.npmrc$/,

    // History files
    /\.bash_history$/,
    /\.zsh_history$/,
];

// Files that can be read but not written
const READ_ONLY_PATTERNS = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
];

// ─── Blocked Command Patterns ─────────────────────────────────────────

const BLOCKED_COMMANDS = [
    // Destructive commands
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~\//,
    /rm\s+-rf\s+\*$/,
    /rm\s+-rf\s+\.\*$/,

    // Privilege escalation
    /\bsudo\b/,
    /\bsu\s+-/,
    /\bsu\s+root/,

    // System modification
    /\bchmod\s+777/,
    /\bchown\s+-R/,

    // Network exfiltration with piping
    /curl\s+.*\|\s*sh/,
    /curl\s+.*\|\s*bash/,
    /wget\s+.*\|\s*sh/,
    /wget\s+.*\|\s*bash/,

    // Dangerous file operations
    />\s*\/dev\//,
    /dd\s+.*of=\/dev\//,

    // Fork bomb
    /:\s*\(\s*\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;/,

    // Environment variable exfiltration
    /env\s*\|\s*(curl|wget|nc)/,
    /printenv\s*\|\s*(curl|wget|nc)/,

    // Keyloggers and sniffers
    /xinput\s+test/,
    /tcpdump/,
    /wireshark/,

    // Process injection
    /gdb\s+-p/,
    /strace\s+-p/,
];

// Commands that require extra scrutiny
const SENSITIVE_COMMANDS = [
    /\bgit\s+push\b/,
    /\bgit\s+push\s+-f/,
    /\bgit\s+push\s+--force/,
    /\bgit\s+reset\s+--hard/,
    /\bnpm\s+publish/,
    /\byarn\s+publish/,
];

// ─── Path Validation ──────────────────────────────────────────────────

export interface PathValidationResult {
    valid: boolean;
    normalizedPath: string;
    error?: string;
}

/**
 * Validate and normalize a file path, ensuring it stays within project directory
 */
export function validatePath(
    inputPath: string,
    projectPath: string,
    operation: 'read' | 'write' = 'read'
): PathValidationResult {
    // Normalize the input path
    const normalizedInput = path.normalize(inputPath);

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(normalizedInput)
        ? normalizedInput
        : path.resolve(projectPath, normalizedInput);

    // Normalize the project path
    const normalizedProjectPath = path.normalize(projectPath);

    // Check if path is within project directory (prevent path traversal)
    if (!absolutePath.startsWith(normalizedProjectPath + path.sep) &&
        absolutePath !== normalizedProjectPath) {
        return {
            valid: false,
            normalizedPath: absolutePath,
            error: `Path "${inputPath}" is outside project directory`,
        };
    }

    // Check against blocked patterns
    for (const pattern of BLOCKED_FILE_PATTERNS) {
        if (pattern.test(absolutePath) || pattern.test(inputPath)) {
            return {
                valid: false,
                normalizedPath: absolutePath,
                error: `Access to "${inputPath}" is blocked for security reasons`,
            };
        }
    }

    // Check read-only patterns for write operations
    if (operation === 'write') {
        for (const pattern of READ_ONLY_PATTERNS) {
            if (pattern.test(absolutePath) || pattern.test(inputPath)) {
                return {
                    valid: false,
                    normalizedPath: absolutePath,
                    error: `File "${inputPath}" is read-only`,
                };
            }
        }
    }

    return {
        valid: true,
        normalizedPath: absolutePath,
    };
}

// ─── Command Validation ───────────────────────────────────────────────

export interface CommandValidationResult {
    valid: boolean;
    warning?: string;
    error?: string;
}

/**
 * Validate a shell command for safety
 */
export function validateCommand(command: string): CommandValidationResult {
    const trimmedCommand = command.trim();

    // Check against blocked patterns
    for (const pattern of BLOCKED_COMMANDS) {
        if (pattern.test(trimmedCommand)) {
            return {
                valid: false,
                error: `Command blocked for security reasons: matches dangerous pattern`,
            };
        }
    }

    // Check for sensitive commands (allowed but warned)
    for (const pattern of SENSITIVE_COMMANDS) {
        if (pattern.test(trimmedCommand)) {
            return {
                valid: true,
                warning: `Sensitive command detected - proceeding with caution`,
            };
        }
    }

    // Check for basic shell injection patterns
    const shellInjectionPatterns = [
        /;\s*rm\s/,
        /`[^`]+`/,  // Backtick command substitution (allowed but noted)
        /\$\([^)]+\)/,  // $() command substitution (allowed but noted)
    ];

    for (const pattern of shellInjectionPatterns) {
        if (pattern.test(trimmedCommand)) {
            // Allow but warn
            return {
                valid: true,
                warning: `Command contains shell substitution - verify intent`,
            };
        }
    }

    return { valid: true };
}

// ─── Content Validation ───────────────────────────────────────────────

/**
 * Check if content contains potentially sensitive data
 */
export function containsSensitiveData(content: string): boolean {
    const sensitivePatterns = [
        // API keys
        /sk-[a-zA-Z0-9]{20,}/,
        /api[_-]?key['":\s]*['"]\w{20,}['"]/i,

        // AWS keys
        /AKIA[0-9A-Z]{16}/,
        /[a-zA-Z0-9/+=]{40}/,

        // Private keys
        /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,

        // GitHub tokens
        /ghp_[a-zA-Z0-9]{36}/,
        /gho_[a-zA-Z0-9]{36}/,
        /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/,
    ];

    for (const pattern of sensitivePatterns) {
        if (pattern.test(content)) {
            return true;
        }
    }

    return false;
}

/**
 * Sanitize output to remove potential sensitive data
 */
export function sanitizeOutput(output: string): string {
    let sanitized = output;

    // Mask potential API keys
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****MASKED****');
    sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_****MASKED****');
    sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, 'AKIA****MASKED****');

    return sanitized;
}
