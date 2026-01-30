import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const USERS_DIR = path.join(os.homedir(), '.olly-molly', 'users');

export async function POST(request: Request) {
  try {
    const backup = await request.json();
    if (!backup || typeof backup !== 'object') {
      return NextResponse.json({ error: 'Invalid backup payload' }, { status: 400 });
    }

    const email: string | undefined = backup._email;
    if (!email) {
      return NextResponse.json({ error: 'Missing _email field' }, { status: 400 });
    }

    const cleanBackup = { ...backup };
    delete cleanBackup._email;

    const emailDir = email.replace(/@/g, '_at_').replace(/\./g, '_');
    const userDir = path.join(USERS_DIR, emailDir);
    await mkdir(userDir, { recursive: true });

    const payload = JSON.stringify(cleanBackup, null, 2);
    await writeFile(path.join(userDir, 'db-backup.json'), payload, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[db] Failed to write backup file', error);
    return NextResponse.json({ error: 'Failed to write backup file' }, { status: 500 });
  }
}
