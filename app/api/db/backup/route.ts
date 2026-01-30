import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const BACKUP_DIR = path.join(os.homedir(), '.olly-molly', 'db-backups');
const USERS_DIR = path.join(os.homedir(), '.olly-molly', 'users');

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

export async function POST(request: Request) {
  try {
    const backup = await request.json();
    if (!backup || typeof backup !== 'object') {
      return NextResponse.json({ error: 'Invalid backup payload' }, { status: 400 });
    }

    // Extract _email before saving
    const email: string | undefined = backup._email;
    const cleanBackup = { ...backup };
    delete cleanBackup._email;

    await mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = formatTimestamp(new Date());
    const filename = `backup-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const latestPath = path.join(BACKUP_DIR, 'latest.json');
    const payload = JSON.stringify(cleanBackup, null, 2);

    const writes: Promise<void>[] = [
      writeFile(filePath, payload, 'utf-8'),
      writeFile(latestPath, payload, 'utf-8'),
    ];

    // Also save to email-based folder if email provided
    if (email) {
      const emailDir = email.replace(/@/g, '_at_').replace(/\./g, '_');
      const userDir = path.join(USERS_DIR, emailDir);
      writes.push(
        mkdir(userDir, { recursive: true }).then(() =>
          writeFile(path.join(userDir, 'db-backup.json'), payload, 'utf-8')
        ),
      );
    }

    await Promise.all(writes);

    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('[db] Failed to write backup file', error);
    return NextResponse.json({ error: 'Failed to write backup file' }, { status: 500 });
  }
}
