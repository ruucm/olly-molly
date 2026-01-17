import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

const BACKUP_DIR = path.join(os.homedir(), '.olly-molly', 'db-backups');

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

    await mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = formatTimestamp(new Date());
    const filename = `backup-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const latestPath = path.join(BACKUP_DIR, 'latest.json');
    const payload = JSON.stringify(backup, null, 2);

    await Promise.all([
      writeFile(filePath, payload, 'utf-8'),
      writeFile(latestPath, payload, 'utf-8'),
    ]);

    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error('[db] Failed to write backup file', error);
    return NextResponse.json({ error: 'Failed to write backup file' }, { status: 500 });
  }
}
