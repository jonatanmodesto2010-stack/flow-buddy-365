import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/**
 * Fetches all rows from a table, bypassing the 1000-row limit via .range()
 */
export async function fetchAllPaginated(
  tableName: string,
  query: {
    select?: string;
    eq?: [string, any][];
    order?: [string, { ascending: boolean; nullsFirst?: boolean }];
  }
) {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = (supabase as any).from(tableName).select(query.select || '*');

    if (query.eq) {
      for (const [col, val] of query.eq) {
        q = q.eq(col, val);
      }
    }

    if (query.order) {
      q = q.order(query.order[0], query.order[1]);
    }

    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Fetches data using .in() filter in chunks to avoid URL length limits
 */
export async function fetchInChunks(
  tableName: string,
  column: string,
  ids: string[],
  select: string = '*',
  chunkSize: number = 200
) {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await (supabase as any)
        .from(tableName)
        .select(select)
        .in(column, chunk);
      if (error) throw error;
      return data || [];
    })
  );

  return results.flat();
}
