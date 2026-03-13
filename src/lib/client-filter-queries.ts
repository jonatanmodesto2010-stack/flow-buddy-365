/**
 * Server-side filter subqueries for Clients page.
 * Each function returns a Set of timeline_ids matching the filter,
 * or null if the filter is not active.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/lib/supabase-helpers';

const PAGE_SIZE = 1000;

/**
 * Fetch timeline_ids that have any of the specified tags.
 */
export async function fetchTimelineIdsByTags(
  orgId: string,
  tagIds: string[]
): Promise<Set<string>> {
  if (tagIds.length === 0) return new Set();

  // Get all timeline_ids from client_timeline_tags that match any tag
  const data = await fetchAllPaginated('client_timeline_tags', {
    select: 'timeline_id',
    eq: [['tag_id', null]], // we'll use .in() manually below
  });
  
  // fetchAllPaginated doesn't support .in(), so do it manually
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: chunk, error } = await (supabase as any)
      .from('client_timeline_tags')
      .select('timeline_id')
      .in('tag_id', tagIds)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (chunk && chunk.length > 0) {
      allData = [...allData, ...chunk];
      from += PAGE_SIZE;
      hasMore = chunk.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return new Set(allData.map((d: any) => d.timeline_id));
}

/**
 * Fetch timeline_ids filtered by boleto status.
 */
export async function fetchTimelineIdsByBoletos(
  orgId: string,
  boletoFilter: string
): Promise<Set<string>> {
  if (boletoFilter === 'all') return new Set();

  if (boletoFilter === 'none') {
    // Get all timeline_ids that have at least one boleto
    const withBoletos = await fetchTimelineIdsWithBoletos(orgId);
    // We need all org timeline_ids minus those with boletos
    const allIds = await fetchAllOrgTimelineIds(orgId);
    const result = new Set<string>();
    for (const id of allIds) {
      if (!withBoletos.has(id)) result.add(id);
    }
    return result;
  }

  // pending or paid
  let statusValue: string;
  if (boletoFilter === 'pending') {
    statusValue = 'pendente';
  } else if (boletoFilter === 'paid') {
    statusValue = 'pago';
  } else {
    return new Set();
  }

  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase as any)
      .from('client_boletos')
      .select('timeline_id')
      .eq('status', statusValue)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return new Set(allData.map((d: any) => d.timeline_id));
}

async function fetchTimelineIdsWithBoletos(orgId: string): Promise<Set<string>> {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase as any)
      .from('client_boletos')
      .select('timeline_id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return new Set(allData.map((d: any) => d.timeline_id));
}

async function fetchAllOrgTimelineIds(orgId: string): Promise<Set<string>> {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase as any)
      .from('client_timelines')
      .select('id')
      .eq('organization_id', orgId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return new Set(allData.map((d: any) => d.id));
}

/**
 * Fetch timeline_ids that have events with any of the specified icons.
 * Searches the FULL event history, not just the latest event.
 */
export async function fetchTimelineIdsByIcons(
  orgId: string,
  icons: string[]
): Promise<Set<string>> {
  if (icons.length === 0) return new Set();

  // Step 1: Get all line_ids for the org's timelines
  let lineIds: string[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase as any)
      .from('timeline_lines')
      .select('id, client_timelines!inner(organization_id)')
      .eq('client_timelines.organization_id', orgId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      lineIds = [...lineIds, ...data.map((d: any) => d.id)];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  if (lineIds.length === 0) return new Set();

  // Step 2: Find events with matching icons in those lines
  const CHUNK_SIZE = 200;
  const matchingLineIds = new Set<string>();

  for (let i = 0; i < lineIds.length; i += CHUNK_SIZE) {
    const chunk = lineIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await (supabase as any)
      .from('timeline_events')
      .select('line_id')
      .in('line_id', chunk)
      .in('icon', icons);

    if (error) throw error;
    for (const d of data || []) {
      matchingLineIds.add(d.line_id);
    }
  }

  if (matchingLineIds.size === 0) return new Set();

  // Step 3: Map line_ids back to timeline_ids
  const lineIdArr = Array.from(matchingLineIds);
  const timelineIds = new Set<string>();

  for (let i = 0; i < lineIdArr.length; i += CHUNK_SIZE) {
    const chunk = lineIdArr.slice(i, i + CHUNK_SIZE);
    const { data, error } = await (supabase as any)
      .from('timeline_lines')
      .select('timeline_id')
      .in('id', chunk);

    if (error) throw error;
    for (const d of data || []) {
      timelineIds.add(d.timeline_id);
    }
  }

  return timelineIds;
}

/**
 * Fetch timeline_ids by timeline filter (with_events, no_events, with_analysis).
 * Uses the FULL event history.
 */
export async function fetchTimelineIdsByTimeline(
  orgId: string,
  timelineFilter: string
): Promise<Set<string>> {
  if (timelineFilter === 'all') return new Set();

  if (timelineFilter === 'with_analysis') {
    // Get timeline_ids that have analysis records
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from('client_analysis_history')
        .select('timeline_id')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += PAGE_SIZE;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return new Set(allData.map((d: any) => d.timeline_id));
  }

  // with_events or no_events: get timeline_ids that have at least one event
  let lineData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase as any)
      .from('timeline_lines')
      .select('id, timeline_id, client_timelines!inner(organization_id)')
      .eq('client_timelines.organization_id', orgId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      lineData = [...lineData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  // Build line_id -> timeline_id map
  const lineToTimeline = new Map<string, string>();
  for (const d of lineData) {
    lineToTimeline.set(d.id, d.timeline_id);
  }

  const allLineIds = Array.from(lineToTimeline.keys());
  if (allLineIds.length === 0) {
    if (timelineFilter === 'no_events') {
      return await fetchAllOrgTimelineIds(orgId);
    }
    return new Set();
  }

  // Check which lines have events
  const CHUNK_SIZE = 200;
  const linesWithEvents = new Set<string>();

  for (let i = 0; i < allLineIds.length; i += CHUNK_SIZE) {
    const chunk = allLineIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await (supabase as any)
      .from('timeline_events')
      .select('line_id')
      .in('line_id', chunk);

    if (error) throw error;
    for (const d of data || []) {
      linesWithEvents.add(d.line_id);
    }
  }

  const timelinesWithEvents = new Set<string>();
  for (const lineId of linesWithEvents) {
    const tid = lineToTimeline.get(lineId);
    if (tid) timelinesWithEvents.add(tid);
  }

  if (timelineFilter === 'with_events') {
    return timelinesWithEvents;
  }

  // no_events: all org timelines minus those with events
  const allIds = await fetchAllOrgTimelineIds(orgId);
  const result = new Set<string>();
  for (const id of allIds) {
    if (!timelinesWithEvents.has(id)) result.add(id);
  }
  return result;
}

/**
 * Intersect multiple ID sets. Returns null if no sets are provided (no filter active).
 * If any set is empty, returns an empty set (short-circuit).
 */
export function intersectIdSets(...sets: (Set<string> | null)[]): Set<string> | null {
  const activeSets = sets.filter((s): s is Set<string> => s !== null);
  if (activeSets.length === 0) return null; // no subquery filters active

  // Short-circuit: if any active set is empty, result is empty
  if (activeSets.some(s => s.size === 0)) return new Set();

  let result = new Set(activeSets[0]);
  for (let i = 1; i < activeSets.length; i++) {
    const next = activeSets[i];
    result = new Set([...result].filter(id => next.has(id)));
    // Short-circuit during intersection
    if (result.size === 0) return result;
  }

  return result;
}
