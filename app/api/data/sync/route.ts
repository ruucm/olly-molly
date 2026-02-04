/**
 * Data sync API endpoint.
 *
 * GET: Fetch all data (or delta since version)
 * POST: Submit changes (create/update/delete)
 */

import { NextResponse } from 'next/server';
import {
  getAll,
  create,
  update,
  remove,
  bulkCreate,
  bulkUpdate,
  getDataVersion,
  incrementDataVersion,
  COLLECTIONS,
} from '@/lib/server-data-store';

// GET: Fetch all data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get('collection');
    const sinceVersion = searchParams.get('since');

    // If specific collection requested
    if (collection) {
      const data = await getAll(collection);
      return NextResponse.json({
        collection,
        data,
        version: getDataVersion(),
      });
    }

    // Fetch all collections
    const [
      members,
      marketAgents,
      tickets,
      activityLogs,
      projects,
      workflows,
      workflowNodes,
      workflowEdges,
      pmRequests,
    ] = await Promise.all([
      getAll(COLLECTIONS.members),
      getAll(COLLECTIONS.marketAgents),
      getAll(COLLECTIONS.tickets),
      getAll(COLLECTIONS.activityLogs),
      getAll(COLLECTIONS.projects),
      getAll(COLLECTIONS.workflows),
      getAll(COLLECTIONS.workflowNodes),
      getAll(COLLECTIONS.workflowEdges),
      getAll(COLLECTIONS.pmRequests),
    ]);

    return NextResponse.json({
      version: getDataVersion(),
      data: {
        members,
        market_agents: marketAgents,
        tickets,
        activity_logs: activityLogs,
        projects,
        workflows,
        workflow_nodes: workflowNodes,
        workflow_edges: workflowEdges,
        pm_requests: pmRequests,
      },
    });
  } catch (error) {
    console.error('[api/data/sync] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

// POST: Submit changes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, collection, data, id, updates } = body;

    if (!collection || !action) {
      return NextResponse.json(
        { error: 'Missing collection or action' },
        { status: 400 }
      );
    }

    let result: unknown;

    switch (action) {
      case 'create':
        if (!data) {
          return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }
        result = await create(collection, data);
        incrementDataVersion();
        break;

      case 'update':
        if (!id || !updates) {
          return NextResponse.json({ error: 'Missing id or updates' }, { status: 400 });
        }
        result = await update(collection, id, updates);
        incrementDataVersion();
        break;

      case 'delete':
        if (!id) {
          return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }
        result = await remove(collection, id);
        incrementDataVersion();
        break;

      case 'bulkCreate':
        if (!data || !Array.isArray(data)) {
          return NextResponse.json({ error: 'Missing data array' }, { status: 400 });
        }
        result = await bulkCreate(collection, data);
        incrementDataVersion();
        break;

      case 'bulkUpdate':
        if (!updates || !Array.isArray(updates)) {
          return NextResponse.json({ error: 'Missing updates array' }, { status: 400 });
        }
        await bulkUpdate(collection, updates);
        incrementDataVersion();
        result = { success: true };
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      result,
      version: getDataVersion(),
    });
  } catch (error) {
    console.error('[api/data/sync] POST error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
