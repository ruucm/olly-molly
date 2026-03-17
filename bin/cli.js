#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const { parseArgs } = require('node:util');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const PACKAGE_NAME = 'olly-molly';
const REPO = 'ruucm/olly-molly';
const SOURCE_TARBALL_URL = `https://github.com/${REPO}/archive/refs/heads/main.tar.gz`;
const RELEASE_BASE_URL = `https://github.com/${REPO}/releases/download`;

// CLI argument definitions (no defaults for string options to allow env var fallback)
const CLI_OPTIONS = {
    // Server settings
    port: { type: 'string', short: 'p' },
    host: { type: 'string', short: 'H' },
    'no-open': { type: 'boolean', default: false },
    // Data/path settings
    'data-dir': { type: 'string', short: 'd' },
    'db-path': { type: 'string' },
    // API key
    'api-key': { type: 'string' },
    // Development/debugging
    dev: { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    version: { type: 'boolean', short: 'V', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    // Advanced options
    reset: { type: 'boolean', default: false },
    'export-db': { type: 'string' },
    'import-db': { type: 'string' },
    'update-only': { type: 'boolean', default: false },
};

// Parse CLI arguments
let args;
try {
    const result = parseArgs({ options: CLI_OPTIONS, allowPositionals: false });
    args = result.values;
} catch (err) {
    console.error(`❌ ${err.message}`);
    console.error('Run "olly-molly --help" for usage information.');
    process.exit(1);
}

// Get package version
function getPackageVersion() {
    try {
        return require('../package.json').version;
    } catch {
        return 'unknown';
    }
}

// Show help message
function showHelp() {
    console.log(`
🐙 Olly Molly - Your AI Development Team

USAGE
  olly-molly [options]

SERVER SETTINGS
  -p, --port <port>       Server port (default: 1234)
  -H, --host <host>       Binding host (default: localhost)
      --no-open           Disable auto browser open

DATA/PATH SETTINGS
  -d, --data-dir <path>   App data directory (default: ~/.olly-molly)
      --db-path <path>    Database path (default: <data-dir>/db)

API SETTINGS
      --api-key <key>     Anthropic API key (saved to ~/.olly-molly/.env)

DEVELOPMENT
      --dev               Run in development mode (next dev)
  -v, --verbose           Enable verbose logging

ADVANCED OPTIONS
      --reset             Reset all app data (with confirmation)
      --export-db <path>  Export database to zip file
      --import-db <path>  Import database from zip file
      --update-only       Download/update only, then exit (don't start server)

INFO
  -V, --version           Show version and exit
  -h, --help              Show this help and exit

ENVIRONMENT VARIABLES
  OLLY_MOLLY_PORT         Server port (fallback)
  OLLY_MOLLY_HOST         Binding host (fallback)
  OLLY_MOLLY_DATA_DIR     App data directory (fallback)
  OLLY_MOLLY_DB_PATH      Database path (fallback)

  ANTHROPIC_API_KEY        Anthropic API key (required for AI agents)

  You can also create ~/.olly-molly/.env file:
    ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
    AWS_REGION=ap-northeast-2
    AWS_ACCESS_KEY_ID=your-key
    AWS_SECRET_ACCESS_KEY=your-secret
    SES_FROM_EMAIL=noreply@example.com

EXAMPLES
  olly-molly                          # Start with defaults
  olly-molly -p 3000                  # Use port 3000
  olly-molly --host 0.0.0.0           # Bind to all interfaces
  olly-molly --dev -v                 # Development mode with verbose
  olly-molly --export-db backup.zip   # Export database
`);
}

// Handle immediate flags
if (args.help) {
    showHelp();
    process.exit(0);
}

if (args.version) {
    console.log(`olly-molly v${getPackageVersion()}`);
    process.exit(0);
}

// Load .env file from data directory
function loadEnvFile(dataDir) {
    const envPath = path.join(dataDir, '.env');
    if (!fs.existsSync(envPath)) return;

    try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            // Only set if not already defined (CLI/system env takes priority)
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch (err) {
        // Silently ignore read errors
    }
}

// Configuration with priority: CLI args > env vars > defaults
function getConfig() {
    const dataDir = args['data-dir']
        || process.env.OLLY_MOLLY_DATA_DIR
        || path.join(os.homedir(), '.olly-molly');

    // Load .env from data directory
    loadEnvFile(dataDir);

    const port = args.port
        || process.env.OLLY_MOLLY_PORT
        || '1234';

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        console.error(`❌ Port must be a number between 1-65535, got: ${port}`);
        process.exit(1);
    }

    const host = args.host
        || process.env.OLLY_MOLLY_HOST
        || 'localhost';

    const dbPath = args['db-path']
        || process.env.OLLY_MOLLY_DB_PATH
        || path.join(dataDir, 'db');

    return {
        APP_DIR: dataDir,
        DB_DIR: dbPath,
        CUSTOM_PROFILES_DIR: path.join(dataDir, 'custom-profiles'),
        PORT: port,
        HOST: host,
        OPEN_BROWSER: !args['no-open'],
        DEV_MODE: args.dev,
        VERBOSE: args.verbose,
    };
}

// Verbose logging utility
function verbose(config, ...messages) {
    if (config.VERBOSE) {
        console.log('🔍', ...messages);
    }
}

// Handle --reset
async function handleReset(config) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        console.log(`\n⚠️  This will delete all data in: ${config.APP_DIR}`);
        console.log('   Including: database, custom profiles, and application files.\n');

        rl.question('Are you sure? Type "yes" to confirm: ', (answer) => {
            rl.close();
            if (answer.toLowerCase() === 'yes') {
                if (fs.existsSync(config.APP_DIR)) {
                    fs.rmSync(config.APP_DIR, { recursive: true, force: true });
                    console.log('✅ All data has been reset.');
                } else {
                    console.log('ℹ️  No data directory found.');
                }
            } else {
                console.log('❌ Reset cancelled.');
            }
            resolve();
        });
    });
}

// Handle --export-db
async function handleExportDb(exportPath, config) {
    const absPath = path.resolve(exportPath);
    const parentDir = path.dirname(absPath);

    if (!fs.existsSync(parentDir)) {
        console.error(`❌ Export directory does not exist: ${parentDir}`);
        process.exit(1);
    }

    if (!fs.existsSync(config.DB_DIR) && !fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
        console.error('❌ No data to export. Database and profiles directories do not exist.');
        process.exit(1);
    }

    console.log('📦 Exporting database...');
    verbose(config, `DB_DIR: ${config.DB_DIR}`);
    verbose(config, `CUSTOM_PROFILES_DIR: ${config.CUSTOM_PROFILES_DIR}`);

    // Create tar.gz using native tar command
    const tmpDir = path.join(os.tmpdir(), `olly-molly-export-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        // Copy data to temp directory
        if (fs.existsSync(config.DB_DIR)) {
            fs.cpSync(config.DB_DIR, path.join(tmpDir, 'db'), { recursive: true });
        }
        if (fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
            fs.cpSync(config.CUSTOM_PROFILES_DIR, path.join(tmpDir, 'custom-profiles'), { recursive: true });
        }

        // Create tar.gz
        const forceLocal = process.platform === 'win32' ? ' --force-local' : '';
        execSync(`tar -czf "${absPath}" -C "${tmpDir}" .${forceLocal}`, { stdio: 'pipe' });
        console.log(`✅ Database exported to: ${absPath}`);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

// Handle --import-db
async function handleImportDb(importPath, config) {
    const absPath = path.resolve(importPath);

    if (!fs.existsSync(absPath)) {
        console.error(`❌ Import file not found: ${absPath}`);
        process.exit(1);
    }

    console.log('📥 Importing database...');
    verbose(config, `Import from: ${absPath}`);

    // Backup existing data
    const backupDir = path.join(os.tmpdir(), `olly-molly-import-backup-${Date.now()}`);
    let hasBackup = false;

    if (fs.existsSync(config.DB_DIR) || fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
        console.log('📋 Backing up existing data...');
        fs.mkdirSync(backupDir, { recursive: true });
        if (fs.existsSync(config.DB_DIR)) {
            fs.cpSync(config.DB_DIR, path.join(backupDir, 'db'), { recursive: true });
        }
        if (fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
            fs.cpSync(config.CUSTOM_PROFILES_DIR, path.join(backupDir, 'custom-profiles'), { recursive: true });
        }
        hasBackup = true;
    }

    try {
        // Extract to temp dir first to validate
        const tmpDir = path.join(os.tmpdir(), `olly-molly-import-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const forceLocal2 = process.platform === 'win32' ? ' --force-local' : '';
        execSync(`tar -xzf "${absPath}" -C "${tmpDir}"${forceLocal2}`, { stdio: 'pipe' });

        // Check if valid export
        const hasDb = fs.existsSync(path.join(tmpDir, 'db'));
        const hasProfiles = fs.existsSync(path.join(tmpDir, 'custom-profiles'));

        if (!hasDb && !hasProfiles) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            console.error('❌ Invalid import file: no db or custom-profiles found.');
            process.exit(1);
        }

        // Remove existing and copy new data
        if (hasDb) {
            if (fs.existsSync(config.DB_DIR)) {
                fs.rmSync(config.DB_DIR, { recursive: true, force: true });
            }
            fs.mkdirSync(path.dirname(config.DB_DIR), { recursive: true });
            fs.cpSync(path.join(tmpDir, 'db'), config.DB_DIR, { recursive: true });
        }

        if (hasProfiles) {
            if (fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
                fs.rmSync(config.CUSTOM_PROFILES_DIR, { recursive: true, force: true });
            }
            fs.mkdirSync(path.dirname(config.CUSTOM_PROFILES_DIR), { recursive: true });
            fs.cpSync(path.join(tmpDir, 'custom-profiles'), config.CUSTOM_PROFILES_DIR, { recursive: true });
        }

        fs.rmSync(tmpDir, { recursive: true, force: true });

        // Clean backup on success
        if (hasBackup) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }

        console.log('✅ Database imported successfully.');
    } catch (err) {
        // Restore backup on failure
        if (hasBackup) {
            console.log('⚠️  Import failed, restoring backup...');
            if (fs.existsSync(path.join(backupDir, 'db'))) {
                fs.cpSync(path.join(backupDir, 'db'), config.DB_DIR, { recursive: true });
            }
            if (fs.existsSync(path.join(backupDir, 'custom-profiles'))) {
                fs.cpSync(path.join(backupDir, 'custom-profiles'), config.CUSTOM_PROFILES_DIR, { recursive: true });
            }
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
        throw err;
    }
}

// Handle --dev mode
async function handleDevMode(config) {
    // Check if source exists (not just prebuilt)
    const packageJsonPath = path.join(config.APP_DIR, 'package.json');
    const srcExists = fs.existsSync(path.join(config.APP_DIR, 'app')) ||
                      fs.existsSync(path.join(config.APP_DIR, 'src'));

    if (!fs.existsSync(packageJsonPath) || !srcExists) {
        console.log('📥 Downloading source for development...');
        if (fs.existsSync(config.APP_DIR)) {
            // Backup user data
            const backupDir = backupUserData(config);
            fs.rmSync(config.APP_DIR, { recursive: true, force: true });
            await download(SOURCE_TARBALL_URL, config.APP_DIR, { stripComponents: 1 });
            restoreUserData(backupDir, config);
        } else {
            await download(SOURCE_TARBALL_URL, config.APP_DIR, { stripComponents: 1 });
        }
        console.log('✅ Source downloaded\n');
    }

    // Install full dependencies (not --omit=dev)
    if (!fs.existsSync(path.join(config.APP_DIR, 'node_modules'))) {
        console.log('📦 Installing dependencies...\n');
        execSync('npm install', { cwd: config.APP_DIR, stdio: 'inherit' });
    }

    const displayHost = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
    console.log(`\n🚀 http://${displayHost}:${config.PORT}\n`);

    // Auto-open browser
    if (config.OPEN_BROWSER) {
        setTimeout(() => {
            const url = `http://${displayHost}:${config.PORT}`;
            const cmd = process.platform === 'darwin' ? 'open'
                      : process.platform === 'win32' ? 'start'
                      : 'xdg-open';
            try {
                execSync(`${cmd} ${url}`, { stdio: 'ignore' });
            } catch {}
        }, 3000);
    }

    // Run next dev
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const server = spawn(npxCmd, ['next', 'dev', '--port', config.PORT, '--hostname', config.HOST], {
        cwd: config.APP_DIR,
        stdio: 'inherit',
        shell: false,
    });

    server.on('close', (code) => process.exit(code || 0));
    process.on('SIGINT', () => server.kill('SIGINT'));
    process.on('SIGTERM', () => server.kill('SIGTERM'));
}

// Get latest version from npm registry
function getNpmVersion() {
    return new Promise((resolve) => {
        https.get(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).version);
                } catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

function getPrebuiltUrl(version) {
    if (!version) return null;
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
        return `${RELEASE_BASE_URL}/v${version}/olly-molly-darwin-${arch}.tar.gz`;
    }
    if (platform === 'win32' && arch === 'x64') {
        return `${RELEASE_BASE_URL}/v${version}/olly-molly-win32-${arch}.tar.gz`;
    }
    return null;
}

function download(url, destDir, { allowNotFound = false, stripComponents = 1 } = {}) {
    return new Promise((resolve, reject) => {
        const tmp = path.join(os.tmpdir(), 'olly-molly.tar.gz');
        const file = fs.createWriteStream(tmp);
        const cleanupTmp = () => {
            try { file.close(); } catch {}
            try { fs.unlinkSync(tmp); } catch {}
        };
        const get = (u) => {
            https.get(u, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) return get(res.headers.location);
                if (res.statusCode !== 200) {
                    cleanupTmp();
                    if (allowNotFound && res.statusCode === 404) return resolve(false);
                    return reject(new Error(`Download failed (${res.statusCode})`));
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    fs.mkdirSync(destDir, { recursive: true });
                    const stripArg = stripComponents > 0 ? ` --strip-components=${stripComponents}` : '';
                    const forceLocal = process.platform === 'win32' ? ' --force-local' : '';
                    execSync(`tar -xzf "${tmp}" -C "${destDir}"${stripArg}${forceLocal}`, { stdio: 'pipe' });
                    fs.unlinkSync(tmp);
                    resolve(true);
                });
            }).on('error', (err) => {
                cleanupTmp();
                reject(err);
            });
        };
        get(url);
    });
}

function getLocalVersion(appDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version;
    } catch { return null; }
}

function hasProductionBuild(appDir, standaloneServerPath) {
    return fs.existsSync(path.join(appDir, '.next', 'BUILD_ID')) ||
        fs.existsSync(standaloneServerPath);
}

function backupUserData(config) {
    const backupDir = path.join(os.tmpdir(), 'olly-molly-backup');
    fs.mkdirSync(backupDir, { recursive: true });

    // Backup database
    if (fs.existsSync(config.DB_DIR)) {
        const dbBackupDir = path.join(backupDir, 'db');
        fs.cpSync(config.DB_DIR, dbBackupDir, { recursive: true });
    }

    // Backup custom profile images
    if (fs.existsSync(config.CUSTOM_PROFILES_DIR)) {
        const profilesBackupDir = path.join(backupDir, 'custom-profiles');
        fs.cpSync(config.CUSTOM_PROFILES_DIR, profilesBackupDir, { recursive: true });
    }

    // Backup users directory (email-based user data)
    const usersDir = path.join(config.APP_DIR, 'users');
    if (fs.existsSync(usersDir)) {
        fs.cpSync(usersDir, path.join(backupDir, 'users'), { recursive: true });
    }

    // Backup user config files (ecosystem.config.js, .env, etc.)
    const userConfigFiles = ['ecosystem.config.js', '.env'];
    for (const file of userConfigFiles) {
        const filePath = path.join(config.APP_DIR, file);
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, path.join(backupDir, file));
        }
    }

    return backupDir;
}

function restoreUserData(backupDir, config) {
    if (!backupDir || !fs.existsSync(backupDir)) return;

    // Restore database
    const dbBackupDir = path.join(backupDir, 'db');
    if (fs.existsSync(dbBackupDir)) {
        fs.mkdirSync(config.DB_DIR, { recursive: true });
        for (const file of fs.readdirSync(dbBackupDir)) {
            if (file.includes('.sqlite')) {
                fs.copyFileSync(path.join(dbBackupDir, file), path.join(config.DB_DIR, file));
            }
        }
    }

    // Restore custom profile images
    const profilesBackupDir = path.join(backupDir, 'custom-profiles');
    if (fs.existsSync(profilesBackupDir)) {
        fs.mkdirSync(config.CUSTOM_PROFILES_DIR, { recursive: true });
        for (const file of fs.readdirSync(profilesBackupDir)) {
            fs.copyFileSync(path.join(profilesBackupDir, file), path.join(config.CUSTOM_PROFILES_DIR, file));
        }
    }

    // Restore users directory (email-based user data)
    const usersBackupDir = path.join(backupDir, 'users');
    if (fs.existsSync(usersBackupDir)) {
        const usersDir = path.join(config.APP_DIR, 'users');
        fs.cpSync(usersBackupDir, usersDir, { recursive: true });
    }

    // Restore user config files (ecosystem.config.js, .env, etc.)
    const userConfigFiles = ['ecosystem.config.js', '.env'];
    for (const file of userConfigFiles) {
        const backupFile = path.join(backupDir, file);
        if (fs.existsSync(backupFile)) {
            fs.copyFileSync(backupFile, path.join(config.APP_DIR, file));
        }
    }

    // Clean up backup
    fs.rmSync(backupDir, { recursive: true, force: true });
}

// Ensure ANTHROPIC_API_KEY exists: CLI arg → env → .env file → prompt user
async function ensureApiKey(config) {
    // 1. --api-key flag: save to .env and set in process.env
    if (args['api-key']) {
        saveApiKeyToEnv(config.APP_DIR, args['api-key']);
        process.env.ANTHROPIC_API_KEY = args['api-key'];
        console.log('✅ API key saved to ~/.olly-molly/.env\n');
        return;
    }

    // 2. Already available via env or .env file (must be a real API key, not OAuth token)
    const existing = process.env.ANTHROPIC_API_KEY;
    if (existing && !existing.includes('sk-ant-oat')) return;

    // 3. Prompt user
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('🔑 Anthropic API key is required to run AI agents.');
    console.log('   Get one at: https://console.anthropic.com/settings/keys\n');

    const key = await new Promise((resolve) => {
        rl.question('Enter your API key (sk-ant-...): ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });

    if (!key) {
        console.error('❌ No API key provided. Exiting.');
        process.exit(1);
    }

    saveApiKeyToEnv(config.APP_DIR, key);
    process.env.ANTHROPIC_API_KEY = key;
    console.log('\n✅ API key saved to ~/.olly-molly/.env\n');
}

function saveApiKeyToEnv(appDir, apiKey) {
    fs.mkdirSync(appDir, { recursive: true });
    const envPath = path.join(appDir, '.env');

    if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        if (/^ANTHROPIC_API_KEY=.*/m.test(content)) {
            content = content.replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${apiKey}`);
        } else {
            content = `ANTHROPIC_API_KEY=${apiKey}\n${content}`;
        }
        fs.writeFileSync(envPath, content);
    } else {
        fs.writeFileSync(envPath, `ANTHROPIC_API_KEY=${apiKey}\n`);
    }
}

async function main() {
    console.log('\n🐙 Olly Molly\n');

    const config = getConfig();

    verbose(config, 'Configuration:');
    verbose(config, `  APP_DIR: ${config.APP_DIR}`);
    verbose(config, `  DB_DIR: ${config.DB_DIR}`);
    verbose(config, `  PORT: ${config.PORT}`);
    verbose(config, `  HOST: ${config.HOST}`);

    // Handle mutually exclusive operations
    if (args.reset) {
        await handleReset(config);
        process.exit(0);
    }

    if (args['export-db']) {
        await handleExportDb(args['export-db'], config);
        process.exit(0);
    }

    if (args['import-db']) {
        await handleImportDb(args['import-db'], config);
        process.exit(0);
    }

    // Handle dev mode
    if (config.DEV_MODE) {
        await handleDevMode(config);
        return;
    }

    // Regular startup flow
    let needsInstall = false;
    let needsBuild = false;
    let usedPrebuilt = false;

    const localVersion = getLocalVersion(config.APP_DIR);
    const npmVersion = await getNpmVersion();
    const prebuiltUrl = getPrebuiltUrl(npmVersion);
    const standaloneServerPath = path.join(config.APP_DIR, '.next', 'standalone', 'server.js');
    const prebuiltOnDisk = () => fs.existsSync(standaloneServerPath);

    async function downloadApp() {
        if (prebuiltUrl) {
            verbose(config, `Trying prebuilt: ${prebuiltUrl}`);
            const ok = await download(prebuiltUrl, config.APP_DIR, { allowNotFound: true, stripComponents: 0 });
            if (ok) {
                usedPrebuilt = true;
                return;
            }
        }
        verbose(config, `Downloading source: ${SOURCE_TARBALL_URL}`);
        await download(SOURCE_TARBALL_URL, config.APP_DIR, { stripComponents: 1 });
        usedPrebuilt = false;
    }

    // Update if npm version is newer
    if (localVersion && npmVersion && localVersion !== npmVersion) {
        console.log(`🔄 Updating ${localVersion} → ${npmVersion}\n`);
        const userDataBackup = backupUserData(config);
        fs.rmSync(config.APP_DIR, { recursive: true, force: true });
        console.log('📥 Downloading...');
        await downloadApp();
        console.log('✅ Downloaded\n');
        restoreUserData(userDataBackup, config);
        needsInstall = !usedPrebuilt;
        needsBuild = !usedPrebuilt;
    }

    // First time
    if (!fs.existsSync(config.APP_DIR)) {
        console.log('📥 Downloading...');
        await downloadApp();
        console.log('✅ Downloaded\n');
        needsInstall = !usedPrebuilt;
        needsBuild = !usedPrebuilt;
    }

    if (!usedPrebuilt && prebuiltOnDisk()) {
        usedPrebuilt = true;
    }

    // Install
    if (needsInstall || !fs.existsSync(path.join(config.APP_DIR, 'node_modules'))) {
        console.log('📦 Installing...\n');
        execSync('npm install --omit=dev', { cwd: config.APP_DIR, stdio: 'inherit' });
    }

    if (usedPrebuilt && !prebuiltOnDisk()) {
        usedPrebuilt = false;
        needsInstall = true;
        needsBuild = true;
    }

    // Build
    if (needsBuild || !hasProductionBuild(config.APP_DIR, standaloneServerPath)) {
        console.log('\n🔨 Building...\n');
        execSync('npm run build', { cwd: config.APP_DIR, stdio: 'inherit' });
    }

    // Exit early if --update-only
    if (args['update-only']) {
        const finalVersion = getLocalVersion(config.APP_DIR);
        console.log(`✅ Update complete (v${finalVersion || 'unknown'}). Exiting without starting server.`);
        process.exit(0);
    }

    // Ensure API key is configured (after download/update so .env is stable)
    await ensureApiKey(config);

    const displayHost = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
    console.log(`\n🚀 http://${displayHost}:${config.PORT}\n`);

    // Auto-open browser after a short delay
    if (config.OPEN_BROWSER) {
        setTimeout(() => {
            const url = `http://${displayHost}:${config.PORT}`;
            const cmd = process.platform === 'darwin' ? 'open'
                      : process.platform === 'win32' ? 'start'
                      : 'xdg-open';
            try {
                execSync(`${cmd} ${url}`, { stdio: 'ignore' });
            } catch {}
        }, 2000);
    }

    let server;
    if (usedPrebuilt) {
        server = spawn('node', [standaloneServerPath], {
            cwd: config.APP_DIR,
            stdio: 'inherit',
            env: { ...process.env, PORT: config.PORT, HOSTNAME: config.HOST },
            shell: false
        });
    } else {
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        server = spawn(npxCmd, ['next', 'start', '--port', config.PORT, '--hostname', config.HOST], {
            cwd: config.APP_DIR, stdio: 'inherit', shell: false
        });
    }

    server.on('close', (code) => process.exit(code || 0));
    process.on('SIGINT', () => server.kill('SIGINT'));
    process.on('SIGTERM', () => server.kill('SIGTERM'));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
