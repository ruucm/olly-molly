/**
 * Server-side persistent data store.
 *
 * All data is stored in JSON files at ~/.olly-molly/data/
 * This replaces IndexedDB for multi-tab consistency.
 *
 * Each collection is stored in a separate file:
 * - members.json
 * - tickets.json
 * - projects.json
 * - workflows.json
 * - workflow_nodes.json
 * - workflow_edges.json
 * - market_agents.json
 * - activity_logs.json
 * - pm_requests.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.olly-molly', 'data');

// Ensure data directory exists
let dataDirCreated = false;
async function ensureDataDir(): Promise<void> {
  if (dataDirCreated) return;
  await mkdir(DATA_DIR, { recursive: true });
  dataDirCreated = true;
}

// Generic CRUD operations for any collection
type DataItem = { id: string; [key: string]: unknown };

async function readCollection<T extends DataItem>(name: string): Promise<T[]> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${name}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T[];
  } catch {
    return [];
  }
}

async function writeCollection<T extends DataItem>(name: string, data: T[]): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${name}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getAll<T extends DataItem>(collection: string): Promise<T[]> {
  return readCollection<T>(collection);
}

export async function getById<T extends DataItem>(collection: string, id: string): Promise<T | null> {
  const items = await readCollection<T>(collection);
  return items.find(item => item.id === id) || null;
}

export async function create<T extends DataItem>(collection: string, item: T): Promise<T> {
  const items = await readCollection<T>(collection);

  // Check for duplicate ID
  const existingIndex = items.findIndex(i => i.id === item.id);
  if (existingIndex >= 0) {
    // Update existing item instead
    items[existingIndex] = item;
  } else {
    items.push(item);
  }

  await writeCollection(collection, items);
  console.log(`[data-store] ${collection}: created/updated ${item.id}`);
  return item;
}

export async function update<T extends DataItem>(
  collection: string,
  id: string,
  updates: Partial<T>
): Promise<T | null> {
  const items = await readCollection<T>(collection);
  const index = items.findIndex(item => item.id === id);

  if (index < 0) {
    console.log(`[data-store] ${collection}: item ${id} not found for update`);
    return null;
  }

  items[index] = { ...items[index], ...updates };
  await writeCollection(collection, items);
  console.log(`[data-store] ${collection}: updated ${id}`);
  return items[index];
}

export async function remove(collection: string, id: string): Promise<boolean> {
  const items = await readCollection<DataItem>(collection);
  const index = items.findIndex(item => item.id === id);

  if (index < 0) {
    console.log(`[data-store] ${collection}: item ${id} not found for delete`);
    return false;
  }

  items.splice(index, 1);
  await writeCollection(collection, items);
  console.log(`[data-store] ${collection}: deleted ${id}`);
  return true;
}

export async function bulkCreate<T extends DataItem>(collection: string, items: T[]): Promise<T[]> {
  const existing = await readCollection<T>(collection);
  const existingIds = new Set(existing.map(i => i.id));

  const newItems = items.filter(i => !existingIds.has(i.id));
  const updatedItems = items.filter(i => existingIds.has(i.id));

  // Update existing items
  for (const item of updatedItems) {
    const index = existing.findIndex(i => i.id === item.id);
    if (index >= 0) {
      existing[index] = item;
    }
  }

  // Add new items
  existing.push(...newItems);

  await writeCollection(collection, existing);
  console.log(`[data-store] ${collection}: bulk created ${newItems.length} new, updated ${updatedItems.length}`);
  return items;
}

export async function bulkUpdate<T extends DataItem>(
  collection: string,
  updates: Array<{ id: string; data: Partial<T> }>
): Promise<void> {
  const items = await readCollection<T>(collection);

  for (const { id, data } of updates) {
    const index = items.findIndex(item => item.id === id);
    if (index >= 0) {
      items[index] = { ...items[index], ...data };
    }
  }

  await writeCollection(collection, items);
  console.log(`[data-store] ${collection}: bulk updated ${updates.length} items`);
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION NAMES
// ═══════════════════════════════════════════════════════════════════════════

export const COLLECTIONS = {
  members: 'members',
  marketAgents: 'market_agents',
  tickets: 'tickets',
  activityLogs: 'activity_logs',
  projects: 'projects',
  workflows: 'workflows',
  workflowNodes: 'workflow_nodes',
  workflowEdges: 'workflow_edges',
  pmRequests: 'pm_requests',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// VERSION TRACKING FOR SYNC
// ═══════════════════════════════════════════════════════════════════════════

let dataVersion = Date.now();

export function getDataVersion(): number {
  return dataVersion;
}

export function incrementDataVersion(): number {
  dataVersion = Date.now();
  return dataVersion;
}

// Wrap mutations to increment version
const originalCreate = create;
const originalUpdate = update;
const originalRemove = remove;
const originalBulkCreate = bulkCreate;
const originalBulkUpdate = bulkUpdate;

export {
  originalCreate as createWithoutVersion,
  originalUpdate as updateWithoutVersion,
  originalRemove as removeWithoutVersion,
};

// Override exports to increment version on mutations
export async function createAndIncrement<T extends DataItem>(collection: string, item: T): Promise<T> {
  const result = await originalCreate(collection, item);
  incrementDataVersion();
  return result;
}

export async function updateAndIncrement<T extends DataItem>(
  collection: string,
  id: string,
  updates: Partial<T>
): Promise<T | null> {
  const result = await originalUpdate(collection, id, updates);
  incrementDataVersion();
  return result;
}

export async function removeAndIncrement(collection: string, id: string): Promise<boolean> {
  const result = await originalRemove(collection, id);
  incrementDataVersion();
  return result;
}

export async function bulkCreateAndIncrement<T extends DataItem>(collection: string, items: T[]): Promise<T[]> {
  const result = await originalBulkCreate(collection, items);
  incrementDataVersion();
  return result;
}

export async function bulkUpdateAndIncrement<T extends DataItem>(
  collection: string,
  updates: Array<{ id: string; data: Partial<T> }>
): Promise<void> {
  await originalBulkUpdate(collection, updates);
  incrementDataVersion();
}
