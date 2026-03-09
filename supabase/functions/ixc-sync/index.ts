import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function encodeIxcToken(rawToken: string): string {
  // Debug: log the token format (without exposing the actual token)
  console.log(`[DEBUG] Token format - length: ${rawToken.length}, has colon: ${rawToken.includes(':')}`);
  
  if (rawToken.includes(':')) {
    return btoa(rawToken);
  }
  return btoa(`${rawToken}:`);
}

// Try different authentication formats
function getAlternativeTokenFormats(rawToken: string): string[] {
  const formats = [];
  
  // Format 1: token: (current)
  formats.push(btoa(`${rawToken}:`));
  
  // Format 2: token (without colon)
  formats.push(btoa(rawToken));
  
  // Format 3: Raw token (not base64 encoded)
  formats.push(rawToken);
  
  // Format 4: Common username:password format if token looks like it might be a password
  if (rawToken.length === 64) {
    formats.push(btoa(`admin:${rawToken}`));
    formats.push(btoa(`root:${rawToken}`));
    formats.push(btoa(`user:${rawToken}`));
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

  console.log(`[DEBUG] Making request to: ${url}`);
  console.log(`[DEBUG] Request body:`, JSON.stringify(body, null, 2));
  console.log(`[DEBUG] Auth header present: ${!!encodedToken}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
      'User-Agent': 'Lovable-IXC-Sync/1.0',
    },
    body: JSON.stringify(body),
  });

  console.log(`[DEBUG] Response status: ${res.status}`);
  console.log(`[DEBUG] Response headers:`, Object.fromEntries(res.headers.entries()));

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ERROR] IXC API failed - Status: ${res.status}, Response: ${text.substring(0, 500)}`);
    throw new Error(`IXC API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    registros: data.registros || [],
    total: parseInt(data.total || '0', 10),
  };
}

// Helper: check if sync was cancelled
async function checkCancelled(supabase: any, syncId: string): Promise<boolean> {
  const { data } = await supabase
    .from('integration_sync_log')
    .select('status')
    .eq('id', syncId)
    .single();
  return data?.status === 'cancelled';
}

// Helper: update sync log progress
async function updateSyncLog(supabase: any, syncId: string, updates: Record<string, any>) {
  await supabase
    .from('integration_sync_log')
    .update({ ...updates })
    .eq('id', syncId);
}

async function fetchAllIxcRecordsWithProgress(
  apiUrl: string, token: string, endpoint: string,
  supabase: any, syncId: string,
  extraBody: Record<string, any> = {},
  progressOffset = 0
) {
  const all: any[] = [];
  let page = 1;
  const perPage = 1000;

  // Get total first
  const first = await ixcRequest(apiUrl, token, endpoint, 1, perPage, extraBody);
  all.push(...first.registros);
  const totalRecords = first.total;

  await updateSyncLog(supabase, syncId, {
    records_processed: progressOffset + all.length,
    total_records: progressOffset + totalRecords,
  });

  if (all.length < totalRecords && first.registros.length >= perPage) {
    page = 2;
    while (all.length < totalRecords) {
      if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

      await delay(150); // Small delay to avoid rate limiting

      const { registros } = await ixcRequest(apiUrl, token, endpoint, page, perPage, extraBody);
      if (!registros.length) break;
      all.push(...registros);

      await updateSyncLog(supabase, syncId, {
        records_processed: progressOffset + all.length,
        total_records: progressOffset + totalRecords,
      });

      if (registros.length < perPage) break;
      page++;
    }
  }

  return all;
}

async function fetchAllIxcRecords(apiUrl: string, token: string, endpoint: string, extraBody: Record<string, any> = {}) {
  const all: any[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { registros, total } = await ixcRequest(apiUrl, token, endpoint, page, perPage, extraBody);
    all.push(...registros);
    if (all.length >= total || registros.length < perPage) break;
    await delay(150);
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
  } catch (e) {
    console.log('Could not fetch filiais:', e.message);
  }
  return filialMap;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Test connection with multiple authentication formats
    if (action === 'test') {
      const { api_url, api_token } = body;
      if (!api_url || !api_token) {
        return new Response(JSON.stringify({ error: 'URL e Token são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[TEST] Testing connection to: ${api_url}`);
      console.log(`[TEST] Token provided: ${api_token ? 'Yes' : 'No'} (length: ${api_token?.length || 0})`);

      // Try different authentication formats
      const tokenFormats = getAlternativeTokenFormats(api_token);
      console.log(`[TEST] Will try ${tokenFormats.length} different auth formats`);

      let lastError = null;

      for (let i = 0; i < tokenFormats.length; i++) {
        const format = tokenFormats[i];
        console.log(`[TEST] Trying format ${i + 1}/${tokenFormats.length}...`);

        try {
          const { total } = await ixcRequest(api_url, format, 'cliente', 1, 1);
          console.log(`[TEST] SUCCESS with format ${i + 1}! Found ${total} total clients`);

          const { total: activeTotal } = await ixcRequest(api_url, format, 'cliente', 1, 1, {
            qtype: 'ativo',
            query: 'S',
            oper: '=',
          });

          return new Response(JSON.stringify({ 
            success: true, 
            total_clients: total, 
            active_clients: activeTotal,
            auth_format_used: i + 1,
            message: `Conexão testada com sucesso (formato de autenticação ${i + 1})` 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });

        } catch (error: any) {
          console.log(`[TEST] Format ${i + 1} failed: ${error.message.substring(0, 100)}`);
          lastError = error;
          
          // If not a 401 error, break (it's probably a different issue)
          if (!error.message.includes('401')) {
            break;
          }
        }
      }

      // All formats failed
      console.error(`[TEST] All authentication formats failed. Last error:`, lastError?.message);
      
      return new Response(JSON.stringify({ 
        error: 'Falha na autenticação com todos os formatos testados',
        details: 'Token pode estar incorreto, expirado ou servidor pode ter restrições de IP',
        formats_tested: tokenFormats.length,
        last_error: lastError?.message || 'Erro desconhecido',
        suggestions: [
          'Verifique se o token está correto e ativo no painel do IXC',
          'Confirme se a URL da API está correta',
          'Verifique se há restrições de IP no servidor IXC',
          'Contate o suporte do IXC para verificar o formato correto da API'
        ]
      }), {
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Diagnostic action
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
            if (k.includes('bloq') || k.includes('status') || k.includes('acesso') || k.includes('suspen')) picked[k] = r[k];
          }
          return picked;
        });
      } catch (e: any) { results.client_fields = { error: e.message }; }

      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Inspect fn_areceber fields
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
          endpoint: 'fn_areceber',
          total_records: total,
          sample_count: registros.length,
          fields: registros.length > 0 ? Object.keys(registros[0]) : [],
          sample_records: registros.slice(0, 3),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Diagnose specific client boletos in IXC
    if (action === 'diagnose_client') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supa = createClient(supabaseUrl, supabaseKey);
      const org_id = body.organization_id;
      const clientIxcId = String(body.client_ixc_id || '');
      
      if (!clientIxcId) {
        return new Response(JSON.stringify({ error: 'client_ixc_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: int } = await supa.from('organization_integrations').select('api_url, api_token').eq('organization_id', org_id).eq('integration_type', 'ixc').single();
      if (!int) return new Response(JSON.stringify({ error: 'No integration found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const token = encodeIxcToken(int.api_token);

      const results: any = { client_ixc_id: clientIxcId };

      // 1. Search fn_areceber by id_cliente
      try {
        const url = `${int.api_url.replace(/\/$/, '')}/fn_areceber`;
        const requestBody = {
          qtype: 'id_cliente',
          query: clientIxcId,
          oper: '=',
          page: '1',
          rp: '100',
          sortname: 'id',
          sortorder: 'asc',
        };
        
        console.log(`[diagnose] Request to fn_areceber:`, JSON.stringify(requestBody));
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`,
            'ixcsoft': 'listar',
          },
          body: JSON.stringify(requestBody),
        });
        
        const rawText = await res.text();
        console.log(`[diagnose] fn_areceber response status: ${res.status}, body length: ${rawText.length}`);
        
        let parsed: any;
        try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText.substring(0, 2000) }; }
        
        results.fn_areceber_by_id_cliente = {
          request: requestBody,
          status: res.status,
          total: parsed.total || 0,
          records_count: parsed.registros?.length || 0,
          sample_records: (parsed.registros || []).slice(0, 5).map((r: any) => ({
            id: r.id,
            id_cliente: r.id_cliente,
            id_contrato: r.id_contrato,
            valor: r.valor,
            valor_aberto: r.valor_aberto,
            data_vencimento: r.data_vencimento,
            status: r.status,
            liquidado: r.liquidado,
            data_emissao: r.data_emissao,
            tipo_cobranca: r.tipo_cobranca,
          })),
        };
      } catch (e: any) {
        results.fn_areceber_by_id_cliente = { error: e.message };
      }

      // 2. Search contracts for this client
      try {
        const { registros, total } = await ixcRequest(int.api_url, token, 'cliente_contrato', 1, 50, {
          qtype: 'id_cliente',
          query: clientIxcId,
          oper: '=',
        });
        results.contracts = {
          total,
          records: registros.map((r: any) => ({
            id: r.id,
            id_cliente: r.id_cliente,
            status: r.status,
            status_internet: r.status_internet,
          })),
        };
      } catch (e: any) {
        results.contracts = { error: e.message };
      }

      // 3. Search for specific boleto IDs in generic search to check id_cliente format
      try {
        // Fetch the page where boleto 37975 would be (id > 37000)
        const { registros: targetPage } = await ixcRequest(int.api_url, token, 'fn_areceber', 1, 100, {
          qtype: 'id',
          query: '37970',
          oper: '>',
        });
        const boleto37975 = targetPage.find((r: any) => String(r.id) === '37975');
        
        // Also search first page for any with this client id
        const { registros: firstPage } = await ixcRequest(int.api_url, token, 'fn_areceber', 1, 1000);
        const clientBoletosPage1 = firstPage.filter((r: any) => String(r.id_cliente) === clientIxcId);
        
        // Check ALL unique id_cliente formats in first page
        const idClienteFormats = new Set(firstPage.slice(0, 5).map((r: any) => `type=${typeof r.id_cliente}, value="${r.id_cliente}", len=${String(r.id_cliente).length}`));
        
        results.generic_search_analysis = {
          boleto_37975_found: !!boleto37975,
          boleto_37975_data: boleto37975 ? {
            id: boleto37975.id,
            id_cliente: boleto37975.id_cliente,
            id_cliente_type: typeof boleto37975.id_cliente,
            id_cliente_length: String(boleto37975.id_cliente).length,
            id_cliente_trimmed: String(boleto37975.id_cliente).trim(),
            id_cliente_matches_2173: String(boleto37975.id_cliente) === '2173',
            id_cliente_trim_matches_2173: String(boleto37975.id_cliente).trim() === '2173',
            valor: boleto37975.valor,
            status: boleto37975.status,
          } : null,
          first_page_client_matches: clientBoletosPage1.length,
          target_page_records: targetPage.length,
          target_page_client_ids: targetPage.filter((r: any) => String(r.id_cliente) === clientIxcId).length,
          id_cliente_format_samples: [...idClienteFormats],
        };
      } catch (e: any) {
        results.generic_search_analysis = { error: e.message };
      }

      // 4. Check local DB
      const { data: localClient } = await supa
        .from('client_timelines')
        .select('id, client_id, client_name, is_active, status')
        .eq('organization_id', org_id)
        .eq('client_id', clientIxcId)
        .maybeSingle();
      results.local_client = localClient;

      if (localClient) {
        const { data: localBoletos, count } = await supa
          .from('client_boletos')
          .select('*', { count: 'exact' })
          .eq('timeline_id', localClient.id)
          .limit(5);
        results.local_boletos = { count, sample: localBoletos };
      }

      // 5. Check the sync mapping
      const { data: allTimelines } = await supa
        .from('client_timelines')
        .select('id, client_id')
        .eq('organization_id', org_id)
        .eq('client_id', clientIxcId);
      results.timeline_mapping = {
        timelines_with_this_client_id: allTimelines?.length || 0,
        timelines: allTimelines,
      };

      return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Full sync or boleto sync
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (action !== 'cron') {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Token inválido' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get organization integrations
    let orgFilter: string | null = body.organization_id || null;

    const intQuery = supabase.from('organization_integrations').select('*').eq('integration_type', 'ixc').eq('is_active', true);
    if (orgFilter) intQuery.eq('organization_id', orgFilter);
    const { data: integrations, error: intError } = await intQuery;
    if (intError) throw intError;

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma integração ativa encontrada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const integration of integrations) {
      const { organization_id, api_url, api_token, api_url_contracts } = integration;
      if (!api_url || !api_token) continue;

      const token = encodeIxcToken(api_token);
      const orgResult: any = { organization_id, clients: 0, boletos: 0, errors: [] };

      // Create sync log entry
      const syncType = action === 'sync_boletos' ? 'boletos' : action === 'sync_clients' ? 'clients' : action === 'sync_areceber' ? 'areceber' : action === 'check_blocked' ? 'blocked_check' : 'full';
      const { data: syncLog } = await supabase
        .from('integration_sync_log')
        .insert({
          organization_id,
          sync_type: syncType,
          status: 'running',
          started_at: new Date().toISOString(),
          records_processed: 0,
          total_records: 0,
        })
        .select('id')
        .single();

      const syncId = syncLog?.id;

      try {
        // === SYNC CLIENTS ===
        if (action === 'sync' || action === 'cron' || action === 'sync_all' || action === 'sync_clients' || action === 'check_blocked') {
          console.log(`[sync] Starting client sync for org ${organization_id}`);
          const startTime = Date.now();

          // Fetch clients with progress tracking
          const clients = await fetchAllIxcRecordsWithProgress(api_url, token, 'cliente', supabase, syncId);
          console.log(`[sync] Fetched ${clients.length} clients in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

          if (await checkCancelled(supabase, syncId)) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Fetch filiais and contracts in parallel
          const contractsUrl = api_url_contracts || api_url;
          const [filialMap, contracts, blockedData] = await Promise.all([
            fetchFiliais(api_url, token),
            fetchAllIxcRecords(contractsUrl, token, 'cliente_contrato'),
            fetchAllIxcRecords(api_url, token, 'cliente_bloqueado').catch(e => {
              console.log(`cliente_bloqueado not available: ${e.message}`);
              return [];
            }),
          ]);

          console.log(`[sync] Fetched ${contracts.length} contracts, ${blockedData.length} blocked, ${filialMap.size} filiais in ${((Date.now() - startTime) / 1000).toFixed(1)}s total`);

          if (await checkCancelled(supabase, syncId)) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Build blocked set from cliente_bloqueado endpoint
          const blockedIds = new Set(blockedData.map((b: any) => String(b.id_cliente)));
          console.log(`Blocked clients from cliente_bloqueado: ${blockedIds.size}`);

          // Build contract map - track blocked status per client across ALL contracts
          const contractMap = new Map<string, { active: boolean; blocked: boolean; hasAnyContract: boolean }>();
          for (const c of contracts) {
            const cid = String(c.id_cliente);
            const isContractActive = c.status === 'A';
            // A client is blocked if they have an active contract but internet is not active
            const isContractBlocked = isContractActive && c.status_internet && c.status_internet !== 'A';
            
            const existing = contractMap.get(cid);
            if (!existing) {
              contractMap.set(cid, {
                active: isContractActive,
                blocked: isContractBlocked || blockedIds.has(cid),
                hasAnyContract: true,
              });
            } else {
              // Merge: if ANY contract is active, client has active contract
              // If ANY contract is blocked, client is blocked
              contractMap.set(cid, {
                active: existing.active || isContractActive,
                blocked: existing.blocked || isContractBlocked,
                hasAnyContract: true,
              });
            }
          }

          console.log(`Contract map size: ${contractMap.size}, blocked from contracts: ${[...contractMap.values()].filter(v => v.blocked).length}, blocked from endpoint: ${blockedIds.size}`);

          // Discover clients from contracts not in main list
          const mainClientIds = new Set(clients.map((c: any) => String(c.id)));
          const contractOnlyIds: string[] = [];
          for (const c of contracts) {
            const cid = String(c.id_cliente);
            if (!mainClientIds.has(cid) && !contractOnlyIds.includes(cid)) {
              contractOnlyIds.push(cid);
            }
          }

          // Fetch contract-only clients in small batches with delays
          if (contractOnlyIds.length > 0) {
            console.log(`[sync] Fetching ${contractOnlyIds.length} contract-only clients`);
            for (let i = 0; i < contractOnlyIds.length; i++) {
              if (i > 0 && i % 10 === 0) {
                await delay(200);
                if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              }
              try {
                const { registros } = await ixcRequest(api_url, token, 'cliente', 1, 1, {
                  qtype: 'id',
                  query: contractOnlyIds[i],
                  oper: '=',
                });
                if (registros.length > 0) clients.push(registros[0]);
              } catch (e) {
                console.log(`Could not fetch client ${contractOnlyIds[i]}: ${e.message}`);
              }
            }
          }

          // Get ALL existing timelines for this org (paginated to bypass 1000-row limit)
          const existingTimelines: any[] = [];
          let existingFrom = 0;
          const PAGE_SIZE = 1000;
          while (true) {
            const { data: page } = await supabase
              .from('client_timelines')
              .select('id, client_id, client_name, is_active, status, ixc_filial_id')
              .eq('organization_id', organization_id)
              .range(existingFrom, existingFrom + PAGE_SIZE - 1);
            if (!page || page.length === 0) break;
            existingTimelines.push(...page);
            if (page.length < PAGE_SIZE) break;
            existingFrom += PAGE_SIZE;
          }
          console.log(`[sync] Loaded ${existingTimelines.length} existing timelines from DB`);

          const existingMap = new Map<string, any>();
          for (const t of existingTimelines) {
            if (t.client_id) existingMap.set(t.client_id, t);
          }

          // Get a user_id for this org
          const { data: orgUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('organization_id', organization_id)
            .in('role', ['owner', 'admin'])
            .limit(1);
          const defaultUserId = orgUsers?.[0]?.user_id;
          if (!defaultUserId) {
            orgResult.errors.push('Nenhum owner/admin encontrado na organização');
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

          let blockedCount = 0;
          let blockedFromEndpointCount = 0;
          let blockedFromContractCount = 0;
          let blockedFromClientFieldCount = 0;
          let archivedCount = 0;
          let activeCount = 0;

          for (const client of clients) {
            const clientIdStr = String(client.id);
            const clientName = client.razao || client.fantasia || `Cliente ${client.id}`;
            const contract = contractMap.get(clientIdStr);
            const isClientActive = client.ativo === 'S';

            const filialId = client.id_filial ? String(client.id_filial) : null;
            const filialName = filialId ? (filialMap.get(filialId) || `Filial ${filialId}`) : null;

            let isActive = true;
            let status = 'active';

            // PRIORITY 1: Blocked (from any source) - ABSOLUTE PRIORITY
            const isBlockedFromEndpoint = blockedIds.has(clientIdStr);
            const isBlockedFromContract = contract?.blocked ?? false;
            const isBlockedFromClient = client.bloqueado === 'S';
            const isBlocked = isBlockedFromEndpoint || isBlockedFromContract || isBlockedFromClient;

            if (isBlocked) {
              isActive = false;
              status = 'active';
              blockedCount++;
              if (isBlockedFromEndpoint) blockedFromEndpointCount++;
              if (isBlockedFromContract) blockedFromContractCount++;
              if (isBlockedFromClient) blockedFromClientFieldCount++;
            } else if (!isClientActive) {
              // PRIORITY 2: Client inactive in IXC (ativo != 'S')
              isActive = false;
              status = 'archived';
              archivedCount++;
            } else if (contract && !contract.active) {
              // PRIORITY 3: Client active but all contracts inactive
              isActive = false;
              status = 'archived';
              archivedCount++;
            } else {
              // PRIORITY 4: Active client
              isActive = true;
              status = 'active';
              activeCount++;
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
              }
            } else {
              toInsert.push({
                client_id: clientIdStr,
                client_name: clientName,
                is_active: isActive,
                status,
                organization_id,
                user_id: defaultUserId,
                start_date: new Date().toISOString().split('T')[0],
                ixc_filial_id: filialId,
                ixc_filial_name: filialName,
              });
            }
          }

          console.log(`[sync] Classification: ${activeCount} active, ${blockedCount} blocked (endpoint: ${blockedFromEndpointCount}, contract: ${blockedFromContractCount}, client_field: ${blockedFromClientFieldCount}), ${archivedCount} archived`);
          console.log(`[sync] DB changes: ${toInsert.length} to insert, ${updateIds.length} to update`);

          // Batch insert
          if (toInsert.length > 0) {
            for (let i = 0; i < toInsert.length; i += 200) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = toInsert.slice(i, i + 200);
              const { error } = await supabase.from('client_timelines').insert(chunk);
              if (error) orgResult.errors.push(`Insert error: ${error.message}`);
            }
          }

          // Batch update
          if (updateIds.length > 0) {
            for (let i = 0; i < updateIds.length; i += 500) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const { error } = await supabase.rpc('batch_upsert_clients', {
                p_ids: updateIds.slice(i, i + 500),
                p_names: updateNames.slice(i, i + 500),
                p_active: updateActive.slice(i, i + 500),
                p_statuses: updateStatuses.slice(i, i + 500),
                p_filial_ids: updateFilialIds.slice(i, i + 500),
                p_filial_names: updateFilialNames.slice(i, i + 500),
              });
              if (error) orgResult.errors.push(`Update error: ${error.message}`);
            }
          }

          orgResult.clients = clients.length;
          orgResult.clients_inserted = toInsert.length;
          orgResult.clients_updated = updateIds.length;
          orgResult.clients_from_contracts = contractOnlyIds.length;
          orgResult.filiais = filialMap.size;
          console.log(`[sync] Client sync done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        }

        // === SYNC BOLETOS ===
        if (action === 'sync_boletos' || action === 'sync' || action === 'cron' || action === 'sync_all') {
          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          console.log(`[sync] Starting boleto sync`);
          const boletoStart = Date.now();

          const currentOffset = orgResult.clients || 0;
          const boletos = await fetchAllIxcRecordsWithProgress(api_url, token, 'fn_areceber', supabase, syncId, {}, currentOffset);
          console.log(`[sync] Fetched ${boletos.length} boletos in ${((Date.now() - boletoStart) / 1000).toFixed(1)}s`);

          // Get ALL timelines with pagination to bypass 1000-row limit
          const allTimelines: any[] = [];
          let timelineFrom = 0;
          const TIMELINE_PAGE = 1000;
          while (true) {
            const { data: page } = await supabase
              .from('client_timelines')
              .select('id, client_id')
              .eq('organization_id', organization_id)
              .range(timelineFrom, timelineFrom + TIMELINE_PAGE - 1);
            if (!page || page.length === 0) break;
            allTimelines.push(...page);
            if (page.length < TIMELINE_PAGE) break;
            timelineFrom += TIMELINE_PAGE;
          }
          console.log(`[sync_boletos] Loaded ${allTimelines.length} timelines for boleto mapping`);

          const clientToTimeline = new Map<string, string>();
          for (const t of allTimelines) {
            if (t.client_id) clientToTimeline.set(t.client_id, t.id);
          }

          const timelineIds = allTimelines.map(t => t.id);
          let existingBoletos = new Map<string, any>();
          if (timelineIds.length > 0) {
            for (let i = 0; i < timelineIds.length; i += 200) {
              const chunk = timelineIds.slice(i, i + 200);
              // Paginate within each chunk to avoid 1000-row limit
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
          console.log(`[sync_boletos] Loaded ${existingBoletos.size} existing boletos from DB`);

          const boletosToInsert: any[] = [];
          const boletosToUpdate: { id: string; status: string; boleto_value: number; due_date: string }[] = [];

          for (const boleto of boletos) {
            const clientId = String(boleto.id_cliente);
            const timelineId = clientToTimeline.get(clientId);
            if (!timelineId) continue;

            const ixcBoletoId = String(boleto.id);
            const valor = parseFloat(boleto.valor || '0');
            const dataVencimento = boleto.data_vencimento || '';

            let status = 'pendente';
            if (boleto.status === 'R' || boleto.liquidado === 'S') {
              status = 'pago';
            } else if (boleto.status === 'C') {
              status = 'cancelado';
            }

            const existing = existingBoletos.get(ixcBoletoId);
            if (existing) {
              if (existing.status !== status || Number(existing.boleto_value) !== valor || existing.due_date !== dataVencimento) {
                boletosToUpdate.push({ id: existing.id, status, boleto_value: valor, due_date: dataVencimento });
              }
            } else {
              boletosToInsert.push({
                timeline_id: timelineId,
                ixc_boleto_id: ixcBoletoId,
                boleto_value: valor,
                due_date: dataVencimento,
                status,
              });
            }
          }

          if (boletosToInsert.length > 0) {
            for (let i = 0; i < boletosToInsert.length; i += 200) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToInsert.slice(i, i + 200);
              const { error } = await supabase.from('client_boletos').insert(chunk);
              if (error) orgResult.errors.push(`Boleto insert error: ${error.message}`);
            }
          }

          if (boletosToUpdate.length > 0) {
            for (let i = 0; i < boletosToUpdate.length; i += 500) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToUpdate.slice(i, i + 500);
              const { error } = await supabase.rpc('batch_upsert_boletos', {
                p_ids: chunk.map(b => b.id),
                p_values: chunk.map(b => b.boleto_value),
                p_dates: chunk.map(b => b.due_date),
                p_statuses: chunk.map(b => b.status),
              });
              if (error) orgResult.errors.push(`Boleto update error: ${error.message}`);
            }
          }

          orgResult.boletos = boletos.length;
          orgResult.boletos_inserted = boletosToInsert.length;
          orgResult.boletos_updated = boletosToUpdate.length;
          console.log(`[sync] Boleto sync done in ${((Date.now() - boletoStart) / 1000).toFixed(1)}s`);
        }

        // === SYNC CONTAS A RECEBER ===
        if (action === 'sync_areceber') {
          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          console.log(`[sync] Starting contas a receber sync`);
          const aReceberStart = Date.now();

          // Fetch all pending receivables (status != R and != C)
          const aReceber = await fetchAllIxcRecordsWithProgress(api_url, token, 'fn_areceber', supabase, syncId, {
            qtype: 'fn_areceber.id',
            query: '0',
            oper: '>',
            grid_param: JSON.stringify([
              { TB: 'fn_areceber.status', OP: '!=', P: 'R' },
              { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
            ]),
          });
          console.log(`[sync] Fetched ${aReceber.length} pending receivables in ${((Date.now() - aReceberStart) / 1000).toFixed(1)}s`);

          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          // Get ALL existing timelines with pagination
          const allTimelinesAR: any[] = [];
          let arFrom = 0;
          const AR_PAGE = 1000;
          while (true) {
            const { data: page } = await supabase
              .from('client_timelines')
              .select('id, client_id')
              .eq('organization_id', organization_id)
              .range(arFrom, arFrom + AR_PAGE - 1);
            if (!page || page.length === 0) break;
            allTimelinesAR.push(...page);
            if (page.length < AR_PAGE) break;
            arFrom += AR_PAGE;
          }
          console.log(`[sync_areceber] Loaded ${allTimelinesAR.length} timelines for receivables mapping`);

          const clientToTimeline = new Map<string, string>();
          const knownClientIds = new Set<string>();
          for (const t of allTimelinesAR) {
            if (t.client_id) {
              clientToTimeline.set(t.client_id, t.id);
              knownClientIds.add(t.client_id);
            }
          }

          // Aggregate debt per client from pending receivables
          const debtPerClient = new Map<string, number>();
          const newClientIds = new Set<string>();

          for (const item of aReceber) {
            const clientId = String(item.id_cliente);
            // Usar valor_aberto (saldo em aberto real) ao invés de valor (valor total do boleto)
            const valorAberto = parseFloat(item.valor_aberto || item.valor || '0');
            debtPerClient.set(clientId, (debtPerClient.get(clientId) || 0) + valorAberto);

            if (!knownClientIds.has(clientId)) {
              newClientIds.add(clientId);
            }
          }

          console.log(`[sync] ${debtPerClient.size} clients with pending debt, ${newClientIds.size} new clients to discover`);

          // Discover new clients
          let newClientsInserted = 0;
          if (newClientIds.size > 0) {
            // Get a user_id for this org
            const { data: orgUsers } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('organization_id', organization_id)
              .in('role', ['owner', 'admin'])
              .limit(1);
            const defaultUserId = orgUsers?.[0]?.user_id;

            if (defaultUserId) {
              const toInsert: any[] = [];
              const newClientIdArray = [...newClientIds];

              for (let i = 0; i < newClientIdArray.length; i++) {
                if (i > 0 && i % 10 === 0) {
                  await delay(200);
                  if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
                }
                try {
                  const { registros } = await ixcRequest(api_url, token, 'cliente', 1, 1, {
                    qtype: 'id',
                    query: newClientIdArray[i],
                    oper: '=',
                  });
                  if (registros.length > 0) {
                    const client = registros[0];
                    const clientName = client.razao || client.fantasia || `Cliente ${client.id}`;
                    const filialId = client.id_filial ? String(client.id_filial) : null;

                    toInsert.push({
                      client_id: newClientIdArray[i],
                      client_name: clientName,
                      is_active: true,
                      status: 'active',
                      organization_id,
                      user_id: defaultUserId,
                      start_date: new Date().toISOString().split('T')[0],
                      ixc_filial_id: filialId,
                      boleto_value: debtPerClient.get(newClientIdArray[i]) || null,
                    });
                    // Also map for debt update
                    clientToTimeline.set(newClientIdArray[i], ''); // placeholder
                  }
                } catch (e) {
                  console.log(`Could not fetch client ${newClientIdArray[i]}: ${e.message}`);
                }
              }

              if (toInsert.length > 0) {
                for (let i = 0; i < toInsert.length; i += 200) {
                  if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
                  const chunk = toInsert.slice(i, i + 200);
                  const { error } = await supabase.from('client_timelines').insert(chunk);
                  if (error) orgResult.errors.push(`Insert error: ${error.message}`);
                  else newClientsInserted += chunk.length;
                }
              }
            }
          }

          // Update boleto_value (total pending debt) for existing clients
          let updatedDebtCount = 0;
          const debtUpdates: { id: string; value: number }[] = [];
          for (const [clientId, totalDebt] of debtPerClient) {
            const timelineId = clientToTimeline.get(clientId);
            if (timelineId && timelineId !== '') {
              debtUpdates.push({ id: timelineId, value: totalDebt });
            }
          }

          // Batch update boleto_value
          for (let i = 0; i < debtUpdates.length; i += 50) {
            if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
            const chunk = debtUpdates.slice(i, i + 50);
            for (const upd of chunk) {
              const { error } = await supabase
                .from('client_timelines')
                .update({ boleto_value: upd.value })
                .eq('id', upd.id);
              if (!error) updatedDebtCount++;
            }
          }

          orgResult.areceber_total = aReceber.length;
          orgResult.clients_discovered = newClientsInserted;
          orgResult.debt_updated = updatedDebtCount;
          console.log(`[sync] Contas a receber done in ${((Date.now() - aReceberStart) / 1000).toFixed(1)}s: ${newClientsInserted} new clients, ${updatedDebtCount} debts updated`);
        }

        if (syncId) {
          await updateSyncLog(supabase, syncId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            records_created: (orgResult.clients_inserted || 0) + (orgResult.boletos_inserted || 0) + (orgResult.clients_discovered || 0),
            records_updated: (orgResult.clients_updated || 0) + (orgResult.boletos_updated || 0) + (orgResult.debt_updated || 0),
          });
        }
      } catch (e: any) {
        if (e.message === 'CANCELLED') {
          orgResult.errors.push('Sincronização cancelada pelo usuário');
          if (syncId) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
          }
        } else {
          orgResult.errors.push(e.message);
          console.error(`[sync] Error: ${e.message}`);
          if (syncId) {
            await updateSyncLog(supabase, syncId, {
              status: 'error',
              error_message: e.message,
              completed_at: new Date().toISOString(),
            });
          }
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
