import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function encodeIxcToken(rawToken: string): string {
  if (rawToken.includes(':')) return btoa(rawToken);
  return btoa(`${rawToken}:`);
}

function normalizeApiUrl(apiUrl: string): string {
  let url = apiUrl.replace(/\/+$/, '');
  const idx = url.toLowerCase().indexOf('/webservice/v1');
  if (idx !== -1) {
    url = url.substring(0, idx + '/webservice/v1'.length);
  } else {
    url = `${url}/webservice/v1`;
  }
  return url;
}

const STATUS_MAP: Record<string, string> = {
  'A': 'Aberta',
  'AB': 'Aberta',
  'N': 'Nova',
  'EA': 'Em andamento',
  'AG': 'Aguardando',
  'EX': 'Executando',
  'F': 'Finalizada',
  'E': 'Encerrada',
  'C': 'Cancelada',
  'FE': 'Fechada',
};

function normalizeStatus(raw: string): string {
  if (!raw) return 'Desconhecido';
  const upper = raw.trim().toUpperCase();
  return STATUS_MAP[upper] || raw;
}

// Statuses considered "open" for filtering
const OPEN_STATUSES = new Set(['A', 'AB', 'N', 'EA', 'AG', 'EX']);

function isOpenStatus(status: string): boolean {
  const upper = (status || '').trim().toUpperCase();
  return OPEN_STATUSES.has(upper);
}

async function fetchClientName(
  baseUrl: string,
  encodedToken: string,
  clientId: string,
  cache: Map<string, string>
): Promise<string> {
  if (cache.has(clientId)) return cache.get(clientId)!;

  try {
    const res = await fetch(`${baseUrl}/cliente/${clientId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedToken}`,
        'ixcsoft': 'listar',
      },
      body: JSON.stringify({
        qtype: 'cliente.id',
        query: String(clientId),
        oper: '=',
        page: '1',
        rp: '1',
        sortname: 'cliente.id',
        sortorder: 'asc',
      }),
    });

    if (res.ok) {
      const text = await res.text();
      if (!text.startsWith('<')) {
        const data = JSON.parse(text);
        const registros = Array.isArray(data.registros) ? data.registros : [];
        if (registros.length > 0) {
          const name = registros[0].razao || registros[0].fantasia || `Cliente #${clientId}`;
          cache.set(clientId, name);
          return name;
        }
      }
    }
  } catch (err) {
    console.error(`Failed to fetch client ${clientId}:`, err);
  }

  const fallback = `Cliente #${clientId}`;
  cache.set(clientId, fallback);
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
      authHeader.replace('Bearer ', '')
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { organization_id } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get IXC credentials
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: integration } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('integration_type', 'ixc')
      .eq('is_active', true)
      .single();

    if (!integration?.api_url || !integration?.api_token) {
      return new Response(JSON.stringify({ error: 'Integração IXC não configurada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assuntoId = integration.ixc_os_retirada_assunto_id;
    if (!assuntoId) {
      return new Response(JSON.stringify({ error: 'ID do assunto de retirada não configurado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = normalizeApiUrl(integration.api_url);
    const encodedToken = encodeIxcToken(integration.api_token);

    // Fetch OS from IXC
    const gridParam = JSON.stringify([
      { "TB": "su_oss_chamado.id_assunto", "OP": "=", "P": assuntoId },
    ]);

    console.log(`Fetching OS retirada: assuntoId=${assuntoId}`);

    const osRes = await fetch(`${baseUrl}/su_oss_chamado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedToken}`,
        'ixcsoft': 'listar',
      },
      body: JSON.stringify({
        qtype: 'su_oss_chamado.id',
        query: '1',
        oper: '>=',
        page: '1',
        rp: '50',
        sortname: 'su_oss_chamado.id',
        sortorder: 'desc',
        grid_param: gridParam,
      }),
    });

    if (!osRes.ok) {
      const errText = await osRes.text();
      console.error(`IXC OS fetch failed: ${osRes.status}`, errText.substring(0, 300));
      return new Response(JSON.stringify({ error: 'Falha ao consultar OS no IXC', os_list: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const osText = await osRes.text();
    if (osText.startsWith('<')) {
      console.error('IXC returned HTML instead of JSON');
      return new Response(JSON.stringify({ error: 'Resposta inválida do IXC', os_list: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const osData = JSON.parse(osText);
    const registros = Array.isArray(osData.registros) ? osData.registros : [];

    console.log(`IXC returned ${registros.length} OS records`);

    // Filter only open statuses
    const openRecords = registros.filter((r: any) => isOpenStatus(r.status || ''));

    console.log(`After open filter: ${openRecords.length} records`);

    // Limit to 50
    const limited = openRecords.slice(0, 50);

    // Dedupe client IDs and batch fetch names
    const clientIds = [...new Set(limited.map((r: any) => String(r.id_cliente)).filter(Boolean))];
    const clientCache = new Map<string, string>();

    // Fetch client names in parallel (batches of 5)
    for (let i = 0; i < clientIds.length; i += 5) {
      const batch = clientIds.slice(i, i + 5);
      await Promise.all(
        batch.map(id => fetchClientName(baseUrl, encodedToken, id, clientCache))
      );
    }

    // Map results
    const osList = limited.map((r: any) => ({
      id: String(r.id || ''),
      id_cliente: String(r.id_cliente || ''),
      cliente_nome: clientCache.get(String(r.id_cliente)) || `Cliente #${r.id_cliente}`,
      data_abertura: r.data_abertura || r.data_inicio || '',
      status: normalizeStatus(r.status || ''),
      descricao: r.mensagem || r.descricao || r.assunto || '',
    }));

    return new Response(JSON.stringify({ os_list: osList, total: osList.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('ixc-os-retirada error:', error);
    return new Response(JSON.stringify({ error: error.message, os_list: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
