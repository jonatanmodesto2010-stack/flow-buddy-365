import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ==================== HELPERS ====================

function encodeIxcToken(rawToken: string): string {
  if (rawToken.includes(':')) return btoa(rawToken);
  return btoa(`${rawToken}:`);
}

function getAlternativeTokenFormats(rawToken: string): string[] {
  const formats = [btoa(`${rawToken}:`), btoa(rawToken), rawToken];
  if (rawToken.length === 64) {
    formats.push(btoa(`admin:${rawToken}`), btoa(`root:${rawToken}`), btoa(`user:${rawToken}`));
  }
  return formats;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ixcRequest(apiUrl: string, encodedToken: string, endpoint: string, page = 1, perPage = 1000, extraBody: Record<string, any> = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}/${endpoint}`;
  const body: Record<string, any> = {
    qtype: 'id',
    query: '0',
    oper: '>',
    page: String(page),
    rp: String(perPage),
    sortname: 'id',
    sortorder: 'asc',
    ...extraBody,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
      'User-Agent': 'Lovable-IXC-Sync/2.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IXC API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    registros: data.registros || [],
    total: parseInt(data.total || '0', 10),
  };
}

async function checkCancelled(supabase: any, syncId: string): Promise<boolean> {
  const { data } = await supabase.from('integration_sync_log').select('status').eq('id', syncId).single();
  if (data?.status === 'cancelled') {
    console.log(`[CANCEL] Cancellation detected for sync ${syncId}`);
    return true;
  }
  return false;
}

async function updateSyncLog(supabase: any, syncId: string, updates: Record<string, any>) {
  await supabase.from('integration_sync_log').update(updates).eq('id', syncId);
}

// ==================== SYNC METRICS ====================

interface SyncFallback {
  endpoint: string;
  reason: string;
  mode: string;
  recordsProcessed: number;
}

interface SyncMetrics {
  mode: 'incremental' | 'full';
  previousLastSyncAt: string | null;
  syncStartedAt: string;
  cutoffUsed: string | null;
  pagesProcessed: number;
  totalRecordsFromIxc: number;
  inserts: number;
  updates: number;
  ignored: number;
  fallbacks: SyncFallback[];
  durations: { phase: string; seconds: number }[];
  totalDurationSeconds: number;
}

function createMetrics(syncStartedAt: string, lastSyncAt: string | null): SyncMetrics {
  return {
    mode: lastSyncAt ? 'incremental' : 'full',
    previousLastSyncAt: lastSyncAt,
    syncStartedAt,
    cutoffUsed: null,
    pagesProcessed: 0,
    totalRecordsFromIxc: 0,
    inserts: 0,
    updates: 0,
    ignored: 0,
    fallbacks: [],
    durations: [],
    totalDurationSeconds: 0,
  };
}

function logSyncSummary(label: string, metrics: SyncMetrics) {
  console.log(`\n[SYNC SUMMARY] ${label}`);
  console.log(`  Mode: ${metrics.mode}`);
  console.log(`  Previous last_sync_at: ${metrics.previousLastSyncAt || 'null (first run)'}`);
  console.log(`  sync_started_at (new cursor): ${metrics.syncStartedAt}`);
  console.log(`  Cutoff used: ${metrics.cutoffUsed || 'N/A'}`);
  console.log(`  Pages processed: ${metrics.pagesProcessed}`);
  console.log(`  Total records from IXC: ${metrics.totalRecordsFromIxc}`);
  console.log(`  Inserts: ${metrics.inserts}`);
  console.log(`  Updates: ${metrics.updates}`);
  console.log(`  Ignored: ${metrics.ignored}`);
  console.log(`  Fallbacks: ${metrics.fallbacks.length}`);
  for (const fb of metrics.fallbacks) {
    console.log(`    [FALLBACK] ${fb.endpoint}: ${fb.reason} → ${fb.mode} (${fb.recordsProcessed} records)`);
  }
  for (const d of metrics.durations) {
    console.log(`  ${d.phase}: ${d.seconds.toFixed(1)}s`);
  }
  console.log(`  Total duration: ${metrics.totalDurationSeconds.toFixed(1)}s\n`);
}

// ==================== INCREMENTAL HELPERS ====================

function computeCutoff(lastSyncAt: string): string {
  // 5-minute safety window
  const dt = new Date(lastSyncAt);
  dt.setMinutes(dt.getMinutes() - 5);
  return dt.toISOString().replace('T', ' ').substring(0, 19);
}

function buildIncrementalGridParam(cutoff: string, existingGridParam?: string): string {
  const filters = existingGridParam ? JSON.parse(existingGridParam) : [];
  filters.push({ TB: 'data_alteracao', OP: '>=', P: cutoff });
  return JSON.stringify(filters);
}

// Try incremental fetch; if it fails, fallback to full scan
async function tryIncrementalRequest(
  apiUrl: string, token: string, endpoint: string, 
  cutoff: string, extraBody: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const testBody = { ...extraBody };
    const existingGrid = testBody.grid_param;
    testBody.grid_param = buildIncrementalGridParam(cutoff, existingGrid);
    await ixcRequest(apiUrl, token, endpoint, 1, 1, testBody);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ==================== STREAM PROCESSING ====================

const PARALLEL_PAGES = 3;
const INTER_BATCH_DELAY = 50;
const BATCH_SIZE = 500;

interface StreamResult {
  totalRecords: number;
  pagesProcessed: number;
}

/**
 * Process IXC records page-by-page with parallel fetching.
 * Records are processed and discarded — never accumulated in memory.
 */
async function processIxcStreaming(
  apiUrl: string, token: string, endpoint: string,
  supabase: any, syncId: string,
  processPage: (registros: any[]) => Promise<void>,
  extraBody: Record<string, any> = {},
  progressOffset = 0,
): Promise<StreamResult> {
  const perPage = 1000;
  
  // First request to get total
  const first = await ixcRequest(apiUrl, token, endpoint, 1, perPage, extraBody);
  const totalRecords = first.total;

  await updateSyncLog(supabase, syncId, {
    total_records: progressOffset + totalRecords,
    records_processed: progressOffset + first.registros.length,
  });

  if (first.registros.length > 0) {
    await processPage(first.registros);
  }

  let processedCount = first.registros.length;
  let pagesProcessed = 1;

  if (first.registros.length >= perPage && processedCount < totalRecords) {
    let nextPage = 2;
    const totalPages = Math.ceil(totalRecords / perPage);

    while (nextPage <= totalPages) {
      if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

      // Fetch PARALLEL_PAGES pages in parallel
      const pagesToFetch = Math.min(PARALLEL_PAGES, totalPages - nextPage + 1);
      const promises = [];
      for (let i = 0; i < pagesToFetch; i++) {
        promises.push(ixcRequest(apiUrl, token, endpoint, nextPage + i, perPage, extraBody));
      }

      const results = await Promise.all(promises);

      for (const result of results) {
        if (result.registros.length > 0) {
          await processPage(result.registros);
          processedCount += result.registros.length;
          pagesProcessed++;
        }
      }

      await updateSyncLog(supabase, syncId, {
        records_processed: progressOffset + processedCount,
      });

      nextPage += pagesToFetch;

      if (results.some(r => r.registros.length < perPage)) break;
      if (processedCount >= totalRecords) break;

      await delay(INTER_BATCH_DELAY);
    }
  }

  return { totalRecords, pagesProcessed };
}

// ==================== PAGINATED DB LOADER ====================

async function loadAllPaginated(supabase: any, table: string, select: string, filters: Record<string, any>): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE - 1);
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
    const { data } = await query;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ==================== SMALL TABLE FETCHERS ====================

async function fetchAllIxcRecords(apiUrl: string, token: string, endpoint: string, extraBody: Record<string, any> = {}) {
  const all: any[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { registros, total } = await ixcRequest(apiUrl, token, endpoint, page, perPage, extraBody);
    all.push(...registros);
    if (all.length >= total || registros.length < perPage) break;
    await delay(50);
    page++;
  }
  return all;
}

async function fetchFiliais(apiUrl: string, token: string): Promise<Map<string, string>> {
  const filialMap = new Map<string, string>();
  try {
    const filiais = await fetchAllIxcRecords(apiUrl, token, 'filial');
    for (const f of filiais) {
      filialMap.set(String(f.id), f.razao || f.fantasia || `Filial ${f.id}`);
    }
  } catch (e: any) {
    console.log('Could not fetch filiais:', e.message);
  }
  return filialMap;
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ==================== TEST CONNECTION ====================
    if (action === 'test') {
      const { api_url, api_token } = body;
      if (!api_url || !api_token) {
        return new Response(JSON.stringify({ error: 'URL e Token são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenFormats = getAlternativeTokenFormats(api_token);
      let lastError: any = null;

      for (let i = 0; i < tokenFormats.length; i++) {
        try {
          const { total } = await ixcRequest(api_url, tokenFormats[i], 'cliente', 1, 1);
          const { total: activeTotal } = await ixcRequest(api_url, tokenFormats[i], 'cliente', 1, 1, {
            qtype: 'ativo', query: 'S', oper: '=',
          });
          return new Response(JSON.stringify({
            success: true, total_clients: total, active_clients: activeTotal,
            auth_format_used: i + 1,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (error: any) {
          lastError = error;
          if (!error.message.includes('401')) break;
        }
      }

      return new Response(JSON.stringify({
        error: 'Falha na autenticação',
        details: lastError?.message || 'Erro desconhecido',
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==================== DIAGNOSTIC ACTIONS (kept as-is) ====================
    if (action === 'diagnose_blocked') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supa = createClient(supabaseUrl, supabaseKey);
      const org_id = body.organization_id;
      const { data: int } = await supa.from('organization_integrations').select('api_url, api_token').eq('organization_id', org_id).eq('integration_type', 'ixc').single();
      if (!int) return new Response(JSON.stringify({ error: 'No integration found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const token = encodeIxcToken(int.api_token);
      const results: any = {};

      try {
        const { registros, total } = await ixcRequest(int.api_url, token, 'cliente_bloqueado', 1, 5);
        results.cliente_bloqueado = { total, sample: registros.slice(0, 2) };
      } catch (e: any) { results.cliente_bloqueado = { error: e.message }; }

      try {
        const { registros, total } = await ixcRequest(int.api_url, token, 'cliente_contrato', 1, 10);
        results.contracts = { total, sample: registros.slice(0, 3).map((r: any) => ({ id: r.id, id_cliente: r.id_cliente, status: r.status, status_internet: r.status_internet, bloqueado: r.bloqueado })) };
      } catch (e: any) { results.contracts = { error: e.message }; }

      try {
        const { registros } = await ixcRequest(int.api_url, token, 'cliente', 1, 3);
        results.client_fields = registros.map((r: any) => {
          const picked: any = { id: r.id, razao: r.razao, ativo: r.ativo };
          for (const k of Object.keys(r)) {
            if (k.includes('bloq') || k.includes('status') || k.includes('acesso') || k.includes('suspen') || k.includes('filial')) picked[k] = r[k];
          }
          return picked;
        });
      } catch (e: any) { results.client_fields = { error: e.message }; }

      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'inspect_areceber') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supa = createClient(supabaseUrl, supabaseKey);
      const org_id = body.organization_id;
      const { data: int } = await supa.from('organization_integrations').select('api_url, api_token').eq('organization_id', org_id).eq('integration_type', 'ixc').single();
      if (!int) return new Response(JSON.stringify({ error: 'No integration found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const token = encodeIxcToken(int.api_token);

      try {
        const { registros, total } = await ixcRequest(int.api_url, token, 'fn_areceber', 1, 5);
        return new Response(JSON.stringify({
          endpoint: 'fn_areceber', total_records: total,
          fields: registros.length > 0 ? Object.keys(registros[0]) : [],
          sample_records: registros.slice(0, 3),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'diagnose_client') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supa = createClient(supabaseUrl, supabaseKey);
      const org_id = body.organization_id;
      const clientIxcId = String(body.client_ixc_id || '');
      if (!clientIxcId) return new Response(JSON.stringify({ error: 'client_ixc_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: int } = await supa.from('organization_integrations').select('api_url, api_token').eq('organization_id', org_id).eq('integration_type', 'ixc').single();
      if (!int) return new Response(JSON.stringify({ error: 'No integration found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const token = encodeIxcToken(int.api_token);
      const results: any = { client_ixc_id: clientIxcId };

      try {
        const url = `${int.api_url.replace(/\/$/, '')}/fn_areceber`;
        const requestBody = { qtype: 'id_cliente', query: clientIxcId, oper: '=', page: '1', rp: '100', sortname: 'id', sortorder: 'asc' };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${token}`, 'ixcsoft': 'listar' }, body: JSON.stringify(requestBody) });
        const rawText = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText.substring(0, 2000) }; }
        results.fn_areceber_by_id_cliente = {
          request: requestBody, status: res.status, total: parsed.total || 0,
          records_count: parsed.registros?.length || 0,
          sample_records: (parsed.registros || []).slice(0, 5).map((r: any) => ({
            id: r.id, id_cliente: r.id_cliente, id_contrato: r.id_contrato, valor: r.valor, valor_aberto: r.valor_aberto, data_vencimento: r.data_vencimento, status: r.status, liquidado: r.liquidado,
          })),
        };
      } catch (e: any) { results.fn_areceber_by_id_cliente = { error: e.message }; }

      try {
        const { registros, total } = await ixcRequest(int.api_url, token, 'cliente_contrato', 1, 50, { qtype: 'id_cliente', query: clientIxcId, oper: '=' });
        results.contracts = { total, records: registros.map((r: any) => ({ id: r.id, id_cliente: r.id_cliente, status: r.status, status_internet: r.status_internet })) };
      } catch (e: any) { results.contracts = { error: e.message }; }

      const { data: localClient } = await supa.from('client_timelines').select('id, client_id, client_name, is_active, status').eq('organization_id', org_id).eq('client_id', clientIxcId).maybeSingle();
      results.local_client = localClient;
      if (localClient) {
        const { data: localBoletos, count } = await supa.from('client_boletos').select('*', { count: 'exact' }).eq('timeline_id', localClient.id).limit(5);
        results.local_boletos = { count, sample: localBoletos };
      }

      return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==================== SYNC ACTIONS ====================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (action !== 'cron') {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const userToken = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Get integrations
    let orgFilter: string | null = body.organization_id || null;
    const intQuery = supabase.from('organization_integrations').select('*').eq('integration_type', 'ixc').eq('is_active', true);
    if (orgFilter) intQuery.eq('organization_id', orgFilter);
    const { data: integrations, error: intError } = await intQuery;
    if (intError) throw intError;

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma integração ativa encontrada' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const integration of integrations) {
      const { organization_id, api_url, api_token, api_url_contracts } = integration;
      if (!api_url || !api_token) continue;

      // For cron: respect per-org sync_interval_minutes
      if (action === 'cron') {
        const intervalMinutes = integration.sync_interval_minutes || 10;
        const lastSync = integration.last_sync_at ? new Date(integration.last_sync_at).getTime() : 0;
        const lastBoletoSync = integration.last_boleto_sync_at ? new Date(integration.last_boleto_sync_at).getTime() : 0;
        const latestSync = Math.max(lastSync, lastBoletoSync);
        const elapsedMinutes = (Date.now() - latestSync) / 60000;
        if (latestSync > 0 && elapsedMinutes < intervalMinutes) {
          console.log(`[cron] Skipping org ${organization_id}: ${Math.round(elapsedMinutes)}min elapsed < ${intervalMinutes}min interval`);
          continue;
        }
      }

      const token = encodeIxcToken(api_token);
      const orgResult: any = { organization_id, clients: 0, boletos: 0, errors: [] };

      // Capture sync_started_at BEFORE any processing
      const syncStartedAt = new Date().toISOString();

      const syncType = action === 'sync_boletos' ? 'boletos' : action === 'sync_clients' ? 'clients' : action === 'sync_areceber' ? 'areceber' : action === 'check_blocked' ? 'blocked_check' : 'full';

      // CONCURRENT SYNC PROTECTION: Check for already running syncs for this org+type
      const { data: runningSyncs } = await supabase
        .from('integration_sync_log')
        .select('id, started_at')
        .eq('organization_id', organization_id)
        .eq('status', 'running')
        .order('created_at', { ascending: false });

      if (runningSyncs && runningSyncs.length > 0) {
        // Check if any running sync is stale (>10 min), auto-cancel it
        const now = Date.now();
        for (const rs of runningSyncs) {
          const age = (now - new Date(rs.started_at).getTime()) / 1000;
          if (age > 600) {
            console.log(`[PROTECTION] Auto-cancelling stale sync ${rs.id} (age: ${Math.round(age)}s)`);
            await updateSyncLog(supabase, rs.id, {
              status: 'error',
              error_message: `Auto-cancelado: sync travada por ${Math.round(age)}s`,
              completed_at: new Date().toISOString(),
            });
          } else {
            // Active sync still running - block new one
            console.log(`[PROTECTION] Blocking new sync: existing sync ${rs.id} still running (age: ${Math.round(age)}s)`);
            return new Response(JSON.stringify({
              error: 'Já existe uma sincronização em andamento para esta organização',
              running_sync_id: rs.id,
              running_since: rs.started_at,
            }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      }

      const { data: syncLog } = await supabase
        .from('integration_sync_log')
        .insert({ organization_id, sync_type: syncType, status: 'running', started_at: syncStartedAt, records_processed: 0, total_records: 0 })
        .select('id')
        .single();
      const syncId = syncLog?.id;

      // Track whether each sub-flow succeeded (for cursor update safety)
      let clientSyncSuccess = false;
      let boletoSyncSuccess = false;
      let areceberSyncSuccess = false;
      const allMetrics: SyncMetrics[] = [];

      try {
        // ==================== SYNC CLIENTS ====================
        if (action === 'sync' || action === 'cron' || action === 'sync_all' || action === 'sync_clients' || action === 'check_blocked') {
          const lastSyncAt = integration.last_sync_at || null;
          const metrics = createMetrics(syncStartedAt, lastSyncAt);
          const startTime = Date.now();

          console.log(`[sync] Starting client sync for org ${organization_id} | mode: ${metrics.mode}`);

          // Determine if we can do incremental for 'cliente'
          let clientExtraBody: Record<string, any> = {};
          let useIncremental = false;

          if (lastSyncAt) {
            const cutoff = computeCutoff(lastSyncAt);
            metrics.cutoffUsed = cutoff;
            const testResult = await tryIncrementalRequest(api_url, token, 'cliente', cutoff);
            if (testResult.success) {
              useIncremental = true;
              clientExtraBody.grid_param = buildIncrementalGridParam(cutoff);
              console.log(`[sync] Incremental mode confirmed for 'cliente', cutoff: ${cutoff}`);
            } else {
              metrics.mode = 'full';
              metrics.fallbacks.push({
                endpoint: 'cliente', reason: testResult.error || 'Incremental filter not supported',
                mode: 'full_scan', recordsProcessed: 0,
              });
              console.log(`[FALLBACK] 'cliente' incremental failed: ${testResult.error} → using full scan`);
            }
          }

          // Stream-process clients page by page, collecting them for comparison
          // NOTE: We still need to accumulate client data for contract cross-referencing.
          // TODO: NEXT OPTIMIZATION - For orgs with >50k clients, consider processing
          // in smaller windows or using DB-side matching instead of in-memory maps.
          const clients: any[] = [];
          const fetchStart = Date.now();

          const streamResult = await processIxcStreaming(
            api_url, token, 'cliente', supabase, syncId,
            async (registros) => { clients.push(...registros); },
            clientExtraBody,
          );

          metrics.pagesProcessed += streamResult.pagesProcessed;
          metrics.totalRecordsFromIxc = streamResult.totalRecords;
          const fetchDuration = (Date.now() - fetchStart) / 1000;
          metrics.durations.push({ phase: 'Fetch clientes', seconds: fetchDuration });

          if (useIncremental && streamResult.totalRecords > 0) {
            // Update fallback record count if we fell back
            const fb = metrics.fallbacks.find(f => f.endpoint === 'cliente');
            if (fb) fb.recordsProcessed = streamResult.totalRecords;
          }

          console.log(`[sync] Fetched ${clients.length} clients (${metrics.mode}) in ${fetchDuration.toFixed(1)}s`);

          if (await checkCancelled(supabase, syncId)) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Fetch filiais, contracts, blocked in parallel (always full scan - small tables)
          const contractsUrl = api_url_contracts || api_url;
          const auxStart = Date.now();
          const [filialMap, contracts, blockedData] = await Promise.all([
            fetchFiliais(api_url, token),
            fetchAllIxcRecords(contractsUrl, token, 'cliente_contrato'),
            fetchAllIxcRecords(api_url, token, 'cliente_bloqueado').catch(e => {
              console.log(`cliente_bloqueado not available: ${e.message}`);
              return [];
            }),
          ]);
          metrics.durations.push({ phase: 'Fetch aux (filiais+contracts+blocked)', seconds: (Date.now() - auxStart) / 1000 });

          if (await checkCancelled(supabase, syncId)) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Build blocked set
          const blockedIds = new Set(blockedData.map((b: any) => String(b.id_cliente)));

          // Build contract map
          const contractMap = new Map<string, { active: boolean; blocked: boolean; hasAnyContract: boolean }>();
          for (const c of contracts) {
            const cid = String(c.id_cliente);
            const isContractActive = c.status === 'A';
            const isContractBlocked = isContractActive && c.status_internet && c.status_internet !== 'A';
            const existing = contractMap.get(cid);
            if (!existing) {
              contractMap.set(cid, { active: isContractActive, blocked: isContractBlocked || blockedIds.has(cid), hasAnyContract: true });
            } else {
              contractMap.set(cid, { active: existing.active || isContractActive, blocked: existing.blocked || isContractBlocked, hasAnyContract: true });
            }
          }

          // Discover clients from contracts not in main list (only in full scan mode)
          if (!useIncremental) {
            const mainClientIds = new Set(clients.map((c: any) => String(c.id)));
            const contractOnlyIds: string[] = [];
            for (const c of contracts) {
              const cid = String(c.id_cliente);
              if (!mainClientIds.has(cid) && !contractOnlyIds.includes(cid)) contractOnlyIds.push(cid);
            }
            if (contractOnlyIds.length > 0) {
              console.log(`[sync] Fetching ${contractOnlyIds.length} contract-only clients`);
              for (let i = 0; i < contractOnlyIds.length; i++) {
                if (i > 0 && i % 10 === 0) {
                  await delay(200);
                  if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
                }
                try {
                  const { registros } = await ixcRequest(api_url, token, 'cliente', 1, 1, { qtype: 'id', query: contractOnlyIds[i], oper: '=' });
                  if (registros.length > 0) clients.push(registros[0]);
                } catch (e: any) { console.log(`Could not fetch client ${contractOnlyIds[i]}: ${e.message}`); }
              }
            }
          }

          // Load existing timelines from DB
          const transformStart = Date.now();
          const existingTimelines = await loadAllPaginated(supabase, 'client_timelines', 'id, client_id, client_name, is_active, status, ixc_filial_id', { organization_id });
          const existingMap = new Map<string, any>();
          for (const t of existingTimelines) {
            if (t.client_id) existingMap.set(t.client_id, t);
          }

          // Get default user_id
          const { data: orgUsers } = await supabase.from('user_roles').select('user_id').eq('organization_id', organization_id).in('role', ['owner', 'admin']).limit(1);
          const defaultUserId = orgUsers?.[0]?.user_id;
          if (!defaultUserId) {
            orgResult.errors.push('Nenhum owner/admin encontrado');
            await updateSyncLog(supabase, syncId, { status: 'error', error_message: 'No admin found', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Process clients
          const toInsert: any[] = [];
          const updateIds: string[] = [];
          const updateNames: string[] = [];
          const updateActive: boolean[] = [];
          const updateStatuses: string[] = [];
          const updateFilialIds: string[] = [];
          const updateFilialNames: string[] = [];

          for (const client of clients) {
            const clientIdStr = String(client.id);
            const clientName = client.razao || client.fantasia || `Cliente ${client.id}`;
            const contract = contractMap.get(clientIdStr);
            const isClientActive = client.ativo === 'S';
            const filialId = client.filial_id ? String(client.filial_id) : null;
            const filialName = filialId ? (filialMap.get(filialId) || `Filial ${filialId}`) : null;

            let isActive = true;
            let status = 'active';

            const isBlockedFromEndpoint = blockedIds.has(clientIdStr);
            const isBlockedFromContract = contract?.blocked ?? false;
            const isBlockedFromClient = client.bloqueado === 'S';
            const isBlocked = isBlockedFromEndpoint || isBlockedFromContract || isBlockedFromClient;

            if (isBlocked) {
              isActive = false;
              status = 'active';
            } else if (!isClientActive) {
              isActive = false;
              status = 'archived';
            } else if (contract && !contract.active) {
              isActive = false;
              status = 'archived';
            } else {
              isActive = true;
              status = 'active';
            }

            const existing = existingMap.get(clientIdStr);
            if (existing) {
              if (existing.client_name !== clientName || existing.is_active !== isActive || existing.status !== status || existing.ixc_filial_id !== filialId) {
                updateIds.push(existing.id);
                updateNames.push(clientName);
                updateActive.push(isActive);
                updateStatuses.push(status);
                updateFilialIds.push(filialId || '');
                updateFilialNames.push(filialName || '');
              } else {
                metrics.ignored++;
              }
            } else {
              toInsert.push({
                client_id: clientIdStr, client_name: clientName, is_active: isActive, status,
                organization_id, user_id: defaultUserId, start_date: new Date().toISOString().split('T')[0],
                ixc_filial_id: filialId, ixc_filial_name: filialName,
              });
            }
          }

          metrics.durations.push({ phase: 'Transform clientes', seconds: (Date.now() - transformStart) / 1000 });

          // DB writes
          const dbStart = Date.now();

          if (toInsert.length > 0) {
            for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = toInsert.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.from('client_timelines').insert(chunk);
              if (error) orgResult.errors.push(`Insert error: ${error.message}`);
            }
          }

          if (updateIds.length > 0) {
            for (let i = 0; i < updateIds.length; i += BATCH_SIZE) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const { error } = await supabase.rpc('batch_upsert_clients', {
                p_ids: updateIds.slice(i, i + BATCH_SIZE),
                p_names: updateNames.slice(i, i + BATCH_SIZE),
                p_active: updateActive.slice(i, i + BATCH_SIZE),
                p_statuses: updateStatuses.slice(i, i + BATCH_SIZE),
                p_filial_ids: updateFilialIds.slice(i, i + BATCH_SIZE),
                p_filial_names: updateFilialNames.slice(i, i + BATCH_SIZE),
              });
              if (error) orgResult.errors.push(`Update error: ${error.message}`);
            }
          }

          metrics.durations.push({ phase: 'DB write clientes', seconds: (Date.now() - dbStart) / 1000 });
          metrics.inserts = toInsert.length;
          metrics.updates = updateIds.length;
          metrics.totalDurationSeconds = (Date.now() - startTime) / 1000;

          orgResult.clients = clients.length;
          orgResult.clients_inserted = toInsert.length;
          orgResult.clients_updated = updateIds.length;

          logSyncSummary('CLIENTS', metrics);
          allMetrics.push(metrics);

          // Mark client sync as successful (no errors thrown)
          clientSyncSuccess = true;
        }

        // ==================== SYNC BOLETOS ====================
        if (action === 'sync_boletos' || action === 'sync' || action === 'cron' || action === 'sync_all') {
          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          const lastBoletoSyncAt = integration.last_boleto_sync_at || null;
          const metrics = createMetrics(syncStartedAt, lastBoletoSyncAt);
          const boletoStart = Date.now();

          console.log(`[sync] Starting boleto sync | mode: ${metrics.mode}`);

          // Test incremental for fn_areceber
          let boletoExtraBody: Record<string, any> = {};
          let useIncremental = false;

          if (lastBoletoSyncAt) {
            const cutoff = computeCutoff(lastBoletoSyncAt);
            metrics.cutoffUsed = cutoff;
            const testResult = await tryIncrementalRequest(api_url, token, 'fn_areceber', cutoff);
            if (testResult.success) {
              useIncremental = true;
              boletoExtraBody.grid_param = buildIncrementalGridParam(cutoff);
              console.log(`[sync] Incremental mode confirmed for 'fn_areceber', cutoff: ${cutoff}`);
            } else {
              metrics.mode = 'full';
              metrics.fallbacks.push({
                endpoint: 'fn_areceber', reason: testResult.error || 'Incremental not supported',
                mode: 'full_scan', recordsProcessed: 0,
              });
              console.log(`[FALLBACK] 'fn_areceber' incremental failed: ${testResult.error} → using full scan`);
            }
          }

          // Load timelines for mapping
          const allTimelines = await loadAllPaginated(supabase, 'client_timelines', 'id, client_id', { organization_id });
          const clientToTimeline = new Map<string, string>();
          for (const t of allTimelines) {
            if (t.client_id) clientToTimeline.set(t.client_id, t.id);
          }

          // Build contract-to-timeline map for fallback mapping
          const contractsUrl = integration.api_url_contracts || api_url;
          let contractToTimeline = new Map<string, string>();
          try {
            const contracts = await fetchAllIxcRecords(contractsUrl, token, 'cliente_contrato');
            for (const c of contracts) {
              const cClientId = String(c.id_cliente || '');
              const tId = clientToTimeline.get(cClientId);
              if (tId) contractToTimeline.set(String(c.id), tId);
            }
            console.log(`[sync_boletos] Contract map built: ${contractToTimeline.size} contracts mapped to timelines`);
          } catch (e: any) {
            console.log(`[sync_boletos] Could not fetch contracts for fallback mapping: ${e.message}`);
          }

          let unmappedBoletoCount = 0;

          // For incremental mode with few expected changes, load only needed existing boletos
          // For full scan, load all existing boletos
          // TODO: NEXT OPTIMIZATION - For orgs with >50k boletos in full scan mode,
          // consider chunked DB queries matching each IXC page's client IDs instead of loading all.
          let existingBoletos = new Map<string, any>();

          const progressOffset = orgResult.clients || 0;
          const boletosToUpsert: any[] = [];
          const boletosToUpdateViaRpc: { id: string; status: string; boleto_value: number; due_date: string; boleto_value_open: number }[] = [];

          if (!useIncremental) {
            // Full scan: load all existing boletos
            const timelineIds = allTimelines.map(t => t.id);
            if (timelineIds.length > 0) {
              for (let i = 0; i < timelineIds.length; i += 200) {
                const chunk = timelineIds.slice(i, i + 200);
                let boletoFrom = 0;
                const BOLETO_PAGE = 1000;
                while (true) {
                  const { data } = await supabase
                    .from('client_boletos')
                    .select('id, ixc_boleto_id, timeline_id, status, boleto_value, due_date')
                    .in('timeline_id', chunk)
                    .not('ixc_boleto_id', 'is', null)
                    .range(boletoFrom, boletoFrom + BOLETO_PAGE - 1);
                  if (!data || data.length === 0) break;
                  for (const b of data) {
                    if (b.ixc_boleto_id) existingBoletos.set(b.ixc_boleto_id, b);
                  }
                  if (data.length < BOLETO_PAGE) break;
                  boletoFrom += BOLETO_PAGE;
                }
              }
            }
            console.log(`[sync_boletos] Loaded ${existingBoletos.size} existing boletos from DB (full scan mode)`);
          }

          // Stream-process boletos
          const fetchStart = Date.now();
          // Collect IXC boleto IDs for incremental existingMap lookup
          const incrementalIxcIds: string[] = [];

          const streamResult = await processIxcStreaming(
            api_url, token, 'fn_areceber', supabase, syncId,
            async (registros) => {
              // For incremental mode, collect IXC IDs first
              if (useIncremental) {
                for (const boleto of registros) {
                  incrementalIxcIds.push(String(boleto.id));
                }
              }

              for (const boleto of registros) {
                const clientId = String(boleto.id_cliente);
                let timelineId = clientToTimeline.get(clientId);
                if (!timelineId) {
                  const contratoId = String(boleto.id_contrato || '');
                  if (contratoId) timelineId = contractToTimeline.get(contratoId);
                }
                if (!timelineId) {
                  unmappedBoletoCount++;
                  continue;
                }

                const ixcBoletoId = String(boleto.id);
                const valor = parseFloat(boleto.valor || '0');
                const valorAberto = parseFloat(boleto.valor_aberto || '0');
                const dataVencimento = boleto.data_vencimento || '';

                let status = 'pendente';
                if (boleto.status === 'R' || boleto.liquidado === 'S') status = 'pago';
                else if (boleto.status === 'C') status = 'cancelado';

                const existing = existingBoletos.get(ixcBoletoId);
                if (existing) {
                  if (existing.status !== status || Number(existing.boleto_value) !== valor || existing.due_date !== dataVencimento) {
                    boletosToUpdateViaRpc.push({ id: existing.id, status, boleto_value: valor, due_date: dataVencimento, boleto_value_open: valorAberto });
                  } else {
                    metrics.ignored++;
                  }
                } else {
                  boletosToUpsert.push({
                    timeline_id: timelineId, ixc_boleto_id: ixcBoletoId,
                    boleto_value: valor, boleto_value_open: valorAberto, due_date: dataVencimento, status,
                  });
                }
              }
            },
            boletoExtraBody,
            progressOffset,
          );

          // For incremental: load existing boletos only for the IDs we got from IXC
          if (useIncremental && incrementalIxcIds.length > 0) {
            console.log(`[sync_boletos] Incremental: loading existing boletos for ${incrementalIxcIds.length} IXC IDs`);
            for (let i = 0; i < incrementalIxcIds.length; i += 500) {
              const chunk = incrementalIxcIds.slice(i, i + 500);
              const { data } = await supabase
                .from('client_boletos')
                .select('id, ixc_boleto_id, timeline_id, status, boleto_value, due_date')
                .in('ixc_boleto_id', chunk);
              if (data) {
                for (const b of data) {
                  if (b.ixc_boleto_id) existingBoletos.set(b.ixc_boleto_id, b);
                }
              }
            }
            console.log(`[sync_boletos] Loaded ${existingBoletos.size} existing boletos for comparison`);

            // Re-process: now that we have existing data, re-classify upserts vs updates
            const reprocessed: any[] = [...boletosToUpsert];
            boletosToUpsert.length = 0;
            metrics.ignored = 0;

            for (const boleto of reprocessed) {
              const existing = existingBoletos.get(boleto.ixc_boleto_id);
              if (existing) {
                if (existing.status !== boleto.status || Number(existing.boleto_value) !== boleto.boleto_value || existing.due_date !== boleto.due_date) {
                  boletosToUpdateViaRpc.push({ id: existing.id, status: boleto.status, boleto_value: boleto.boleto_value, due_date: boleto.due_date, boleto_value_open: boleto.boleto_value_open });
                } else {
                  metrics.ignored++;
                }
              } else {
                boletosToUpsert.push(boleto);
              }
            }
          }

          if (unmappedBoletoCount > 0) {
            console.log(`[sync_boletos] ${unmappedBoletoCount} boletos sem mapeamento (nem por id_cliente nem por id_contrato)`);
          }

          metrics.pagesProcessed += streamResult.pagesProcessed;
          metrics.totalRecordsFromIxc = streamResult.totalRecords;
          metrics.durations.push({ phase: 'Fetch+classify boletos', seconds: (Date.now() - fetchStart) / 1000 });

          // Update fallback record count
          const fb = metrics.fallbacks.find(f => f.endpoint === 'fn_areceber');
          if (fb) fb.recordsProcessed = streamResult.totalRecords;

          // DB writes - use native upsert for new boletos
          const dbStart = Date.now();
          let totalInserted = 0;

          if (boletosToUpsert.length > 0) {
            for (let i = 0; i < boletosToUpsert.length; i += BATCH_SIZE) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToUpsert.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.from('client_boletos').upsert(chunk, {
                onConflict: 'ixc_boleto_id',
                ignoreDuplicates: false,
              });
              if (error) {
                orgResult.errors.push(`Boleto upsert error: ${error.message}`);
                console.error(`[sync_boletos] Upsert failed: ${error.message}`);
              } else {
                totalInserted += chunk.length;
              }
            }
          }

          // Update existing boletos via RPC (batch update)
          if (boletosToUpdateViaRpc.length > 0) {
            for (let i = 0; i < boletosToUpdateViaRpc.length; i += BATCH_SIZE) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToUpdateViaRpc.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.rpc('batch_upsert_boletos', {
                p_ids: chunk.map(b => b.id),
                p_values: chunk.map(b => b.boleto_value),
                p_dates: chunk.map(b => b.due_date),
                p_statuses: chunk.map(b => b.status),
                p_values_open: chunk.map(b => b.boleto_value_open),
              });
              if (error) orgResult.errors.push(`Boleto update error: ${error.message}`);
            }
          }

          metrics.durations.push({ phase: 'DB write boletos', seconds: (Date.now() - dbStart) / 1000 });
          metrics.inserts = totalInserted;
          metrics.updates = boletosToUpdateViaRpc.length;
          metrics.totalDurationSeconds = (Date.now() - boletoStart) / 1000;

          orgResult.boletos = streamResult.totalRecords;
          orgResult.boletos_inserted = totalInserted;
          orgResult.boletos_updated = boletosToUpdateViaRpc.length;
          orgResult.boletos_unmapped = unmappedBoletoCount;

          logSyncSummary('BOLETOS', metrics);
          allMetrics.push(metrics);

          boletoSyncSuccess = true;
        }

        // ==================== SYNC CONTAS A RECEBER ====================
        if (action === 'sync_areceber') {
          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          const lastBoletoSyncAt = integration.last_boleto_sync_at || null;
          const metrics = createMetrics(syncStartedAt, lastBoletoSyncAt);
          const aReceberStart = Date.now();

          console.log(`[sync] Starting contas a receber sync | mode: ${metrics.mode}`);

          // Build extra body for pending receivables
          let aReceberExtra: Record<string, any> = {
            qtype: 'fn_areceber.id', query: '0', oper: '>',
            grid_param: JSON.stringify([
              { TB: 'fn_areceber.status', OP: '!=', P: 'R' },
              { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
            ]),
          };

          // Try incremental
          if (lastBoletoSyncAt) {
            const cutoff = computeCutoff(lastBoletoSyncAt);
            metrics.cutoffUsed = cutoff;
            const baseFilters = [
              { TB: 'fn_areceber.status', OP: '!=', P: 'R' },
              { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
              { TB: 'data_alteracao', OP: '>=', P: cutoff },
            ];
            const testExtra = { ...aReceberExtra, grid_param: JSON.stringify(baseFilters) };
            const testResult = await tryIncrementalRequest(api_url, token, 'fn_areceber', cutoff, {
              qtype: 'fn_areceber.id', query: '0', oper: '>',
              grid_param: JSON.stringify([
                { TB: 'fn_areceber.status', OP: '!=', P: 'R' },
                { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
              ]),
            });
            if (testResult.success) {
              aReceberExtra = testExtra;
              console.log(`[sync] Incremental mode confirmed for 'fn_areceber' (areceber), cutoff: ${cutoff}`);
            } else {
              metrics.mode = 'full';
              metrics.fallbacks.push({
                endpoint: 'fn_areceber (areceber)', reason: testResult.error || 'Incremental not supported',
                mode: 'full_scan', recordsProcessed: 0,
              });
              console.log(`[FALLBACK] 'fn_areceber' (areceber) incremental failed → full scan`);
            }
          }

          // Load timelines
          const allTimelinesAR = await loadAllPaginated(supabase, 'client_timelines', 'id, client_id', { organization_id });
          const clientToTimeline = new Map<string, string>();
          const knownClientIds = new Set<string>();
          for (const t of allTimelinesAR) {
            if (t.client_id) { clientToTimeline.set(t.client_id, t.id); knownClientIds.add(t.client_id); }
          }

          // Build contract-to-timeline map for fallback mapping (areceber)
          const contractsUrlAR = integration.api_url_contracts || api_url;
          let contractToTimelineAR = new Map<string, string>();
          try {
            const contractsAR = await fetchAllIxcRecords(contractsUrlAR, token, 'cliente_contrato');
            for (const c of contractsAR) {
              const cClientId = String(c.id_cliente || '');
              const tId = clientToTimeline.get(cClientId);
              if (tId) contractToTimelineAR.set(String(c.id), tId);
            }
            console.log(`[sync_areceber] Contract map built: ${contractToTimelineAR.size} contracts mapped`);
          } catch (e: any) {
            console.log(`[sync_areceber] Could not fetch contracts: ${e.message}`);
          }

          // Stream process pending receivables
          const debtPerClient = new Map<string, number>();
          const newClientIds = new Set<string>();

          const streamResult = await processIxcStreaming(
            api_url, token, 'fn_areceber', supabase, syncId,
            async (registros) => {
              for (const item of registros) {
                let clientId = String(item.id_cliente);
                // Fallback via contrato if client not known
                if (!knownClientIds.has(clientId)) {
                  const contratoId = String(item.id_contrato || '');
                  const fallbackTimeline = contratoId ? contractToTimelineAR.get(contratoId) : undefined;
                  if (fallbackTimeline) {
                    // Find the clientId that maps to this timeline
                    for (const [cid, tid] of clientToTimeline) {
                      if (tid === fallbackTimeline) { clientId = cid; break; }
                    }
                  }
                }
                const valorAberto = parseFloat(item.valor_aberto || item.valor || '0');
                debtPerClient.set(clientId, (debtPerClient.get(clientId) || 0) + valorAberto);
                if (!knownClientIds.has(clientId)) newClientIds.add(clientId);
              }
            },
            aReceberExtra,
          );

          metrics.pagesProcessed = streamResult.pagesProcessed;
          metrics.totalRecordsFromIxc = streamResult.totalRecords;
          metrics.durations.push({ phase: 'Fetch+process areceber', seconds: (Date.now() - aReceberStart) / 1000 });

          // Update fallback record count
          const fb = metrics.fallbacks.find(f => f.endpoint === 'fn_areceber (areceber)');
          if (fb) fb.recordsProcessed = streamResult.totalRecords;

          // Discover new clients
          let newClientsInserted = 0;
          if (newClientIds.size > 0) {
            const { data: orgUsers } = await supabase.from('user_roles').select('user_id').eq('organization_id', organization_id).in('role', ['owner', 'admin']).limit(1);
            const defaultUserId = orgUsers?.[0]?.user_id;
            if (defaultUserId) {
              const toInsert: any[] = [];
              const newArr = [...newClientIds];
              for (let i = 0; i < newArr.length; i++) {
                if (i > 0 && i % 10 === 0) {
                  await delay(200);
                  if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
                }
                try {
                  const { registros } = await ixcRequest(api_url, token, 'cliente', 1, 1, { qtype: 'id', query: newArr[i], oper: '=' });
                  if (registros.length > 0) {
                    const client = registros[0];
                    toInsert.push({
                      client_id: newArr[i], client_name: client.razao || client.fantasia || `Cliente ${client.id}`,
                      is_active: true, status: 'active', organization_id, user_id: defaultUserId,
                      start_date: new Date().toISOString().split('T')[0],
                      ixc_filial_id: client.id_filial ? String(client.id_filial) : null,
                      boleto_value: debtPerClient.get(newArr[i]) || null,
                    });
                    clientToTimeline.set(newArr[i], '');
                  }
                } catch (e: any) { console.log(`Could not fetch client ${newArr[i]}: ${e.message}`); }
              }
              if (toInsert.length > 0) {
                for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
                  if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
                  const chunk = toInsert.slice(i, i + BATCH_SIZE);
                  const { error } = await supabase.from('client_timelines').insert(chunk);
                  if (error) orgResult.errors.push(`Insert error: ${error.message}`);
                  else newClientsInserted += chunk.length;
                }
              }
              metrics.inserts += newClientsInserted;
            }
          }

          // Update boleto_value (total debt) for existing clients
          let updatedDebtCount = 0;
          const debtUpdates: { id: string; value: number }[] = [];
          for (const [clientId, totalDebt] of debtPerClient) {
            const timelineId = clientToTimeline.get(clientId);
            if (timelineId && timelineId !== '') debtUpdates.push({ id: timelineId, value: totalDebt });
          }

          for (let i = 0; i < debtUpdates.length; i += 50) {
            if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
            const chunk = debtUpdates.slice(i, i + 50);
            for (const upd of chunk) {
              const { error } = await supabase.from('client_timelines').update({ boleto_value: upd.value }).eq('id', upd.id);
              if (!error) updatedDebtCount++;
            }
          }

          metrics.updates += updatedDebtCount;
          metrics.totalDurationSeconds = (Date.now() - aReceberStart) / 1000;

          orgResult.areceber_total = streamResult.totalRecords;
          orgResult.clients_discovered = newClientsInserted;
          orgResult.debt_updated = updatedDebtCount;

          logSyncSummary('CONTAS A RECEBER', metrics);
          allMetrics.push(metrics);

          areceberSyncSuccess = true;
        }

        // ==================== FINALIZE: Update sync log + cursors ====================
        if (syncId) {
          const totalInserts = (orgResult.clients_inserted || 0) + (orgResult.boletos_inserted || 0) + (orgResult.clients_discovered || 0);
          const totalUpdates = (orgResult.clients_updated || 0) + (orgResult.boletos_updated || 0) + (orgResult.debt_updated || 0);

          // Build sync_metadata summary
          const syncMetadata: any = {
            metrics: allMetrics.map(m => ({
              mode: m.mode,
              previousLastSyncAt: m.previousLastSyncAt,
              syncStartedAt: m.syncStartedAt,
              cutoffUsed: m.cutoffUsed,
              pagesProcessed: m.pagesProcessed,
              totalRecordsFromIxc: m.totalRecordsFromIxc,
              inserts: m.inserts,
              updates: m.updates,
              ignored: m.ignored,
              fallbacks: m.fallbacks,
              totalDurationSeconds: m.totalDurationSeconds,
            })),
          };

          await updateSyncLog(supabase, syncId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            records_created: totalInserts,
            records_updated: totalUpdates,
            sync_metadata: syncMetadata,
          });

          // Update last_sync_at cursors ONLY on complete success
          if (clientSyncSuccess && (action === 'sync' || action === 'cron' || action === 'sync_all' || action === 'sync_clients')) {
            await supabase.from('organization_integrations').update({ last_sync_at: syncStartedAt }).eq('id', integration.id);
            console.log(`[sync] ✅ Updated last_sync_at = ${syncStartedAt}`);
          }

          if ((boletoSyncSuccess || areceberSyncSuccess) && (action === 'sync_boletos' || action === 'sync' || action === 'cron' || action === 'sync_all' || action === 'sync_areceber')) {
            await supabase.from('organization_integrations').update({ last_boleto_sync_at: syncStartedAt }).eq('id', integration.id);
            console.log(`[sync] ✅ Updated last_boleto_sync_at = ${syncStartedAt}`);
          }
        }

      } catch (e: any) {
        if (e.message === 'CANCELLED') {
          const cancelTime = new Date().toISOString();
          const cancelDuration = ((Date.now() - new Date(syncStartedAt).getTime()) / 1000).toFixed(1);
          console.log(`[CANCEL] Sync ${syncId} cancelled after ${cancelDuration}s`);
          console.log(`[CANCEL] Partial progress: clients=${orgResult.clients_inserted || 0}+${orgResult.clients_updated || 0}, boletos=${orgResult.boletos_inserted || 0}+${orgResult.boletos_updated || 0}`);
          
          orgResult.errors.push('Sincronização cancelada pelo usuário');
          if (syncId) {
            const cancelMetadata: any = {
              cancelledAt: cancelTime,
              cancelDurationSeconds: parseFloat(cancelDuration),
              partialMetrics: allMetrics.map(m => ({
                mode: m.mode, pagesProcessed: m.pagesProcessed,
                inserts: m.inserts, updates: m.updates, ignored: m.ignored,
                fallbacks: m.fallbacks,
              })),
            };
            await updateSyncLog(supabase, syncId, {
              status: 'cancelled',
              completed_at: cancelTime,
              records_created: (orgResult.clients_inserted || 0) + (orgResult.boletos_inserted || 0) + (orgResult.clients_discovered || 0),
              records_updated: (orgResult.clients_updated || 0) + (orgResult.boletos_updated || 0) + (orgResult.debt_updated || 0),
              sync_metadata: cancelMetadata,
            });
          }
          // Do NOT update last_sync_at on cancellation
        } else {
          orgResult.errors.push(e.message);
          console.error(`[sync] Error: ${e.message}`);
          if (syncId) {
            // Include fallback info in error message for auditability
            const fallbackInfo = allMetrics.flatMap(m => m.fallbacks);
            const errorPayload: any = {
              status: 'error',
              error_message: e.message,
              completed_at: new Date().toISOString(),
            };
            if (fallbackInfo.length > 0 || allMetrics.length > 0) {
              errorPayload.sync_metadata = {
                metrics: allMetrics.map(m => ({
                  mode: m.mode, fallbacks: m.fallbacks,
                  pagesProcessed: m.pagesProcessed, inserts: m.inserts, updates: m.updates,
                })),
              };
            }
            await updateSyncLog(supabase, syncId, errorPayload);
          }
          // Do NOT update last_sync_at on error
        }
      }

      results.push(orgResult);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[sync] Fatal error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
