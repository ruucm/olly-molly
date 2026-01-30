import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const USERS_DIR = path.join(os.homedir(), '.olly-molly', 'users');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
    }

    const emailDir = email.replace(/@/g, '_at_').replace(/\./g, '_');
    const backupPath = path.join(USERS_DIR, emailDir, 'db-backup.json');

    try {
      const content = await readFile(backupPath, 'utf-8');
      const backup = JSON.parse(content);
      return NextResponse.json({ exists: true, backup });
    } catch {
      return NextResponse.json({ exists: false });
    }
  } catch (error) {
    console.error('[db] Failed to check restore backup', error);
    return NextResponse.json({ error: 'Failed to check backup' }, { status: 500 });
  }
}
