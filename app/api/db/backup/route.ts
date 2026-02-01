import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const USERS_DIR = path.join(os.homedir(), '.olly-molly', 'users');

// Track concurrent backup requests for debugging
let activeBackupRequests = 0;
let totalBackupRequests = 0;

function getMemoryUsage(): string {
  const used = process.memoryUsage();
  return `heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB, rss: ${Math.round(used.rss / 1024 / 1024)}MB`;
}

export async function POST(request: Request) {
  const requestId = ++totalBackupRequests;
  activeBackupRequests++;
  const startTime = Date.now();

  console.log(`[db:backup] Request #${requestId} started | active: ${activeBackupRequests}, memory: ${getMemoryUsage()}`);

  try {
    const backup = await request.json();
    if (!backup || typeof backup !== 'object') {
      activeBackupRequests--;
      return NextResponse.json({ error: 'Invalid backup payload' }, { status: 400 });
    }

    const email: string | undefined = backup._email;
    if (!email) {
      activeBackupRequests--;
      return NextResponse.json({ error: 'Missing _email field' }, { status: 400 });
    }

    const cleanBackup = { ...backup };
    delete cleanBackup._email;

    const emailDir = email.replace(/@/g, '_at_').replace(/\./g, '_');
    const userDir = path.join(USERS_DIR, emailDir);
    await mkdir(userDir, { recursive: true });

    const payload = JSON.stringify(cleanBackup, null, 2);
    const payloadSize = Buffer.byteLength(payload, 'utf-8');

    await writeFile(path.join(userDir, 'db-backup.json'), payload, 'utf-8');

    const duration = Date.now() - startTime;
    activeBackupRequests--;
    console.log(`[db:backup] Request #${requestId} completed | duration: ${duration}ms, size: ${Math.round(payloadSize / 1024)}KB, active: ${activeBackupRequests}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    activeBackupRequests--;
    console.error(`[db:backup] Request #${requestId} FAILED after ${duration}ms | active: ${activeBackupRequests}, error:`, error);
    return NextResponse.json({ error: 'Failed to write backup file' }, { status: 500 });
  }
}
