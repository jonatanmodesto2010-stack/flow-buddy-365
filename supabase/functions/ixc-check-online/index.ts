import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function encodeIxcToken(rawToken: string): string {
  if (rawToken.includes(':')) return btoa(rawToken);
  return btoa(`${rawToken}:`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('ixc-check-online: v4 starting (with connection times)');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { organization_id, client_ids } = body;
    console.log(`org: ${organization_id}, clients count: ${client_ids?.length || 0}`);

    if (!organization_id || !client_ids?.length) {
      return new Response(JSON.stringify({ online_clients: [], total_online: 0, connection_times: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: integration } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('integration_type', 'ixc')
      .eq('is_active', true)
      .single();

    if (!integration?.api_url || !integration?.api_token) {
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada', online_clients: [], connection_times: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedToken = encodeIxcToken(integration.api_token);
    let apiUrl = integration.api_url.replace(/\/$/, '');
    const wsMatch = apiUrl.match(/(https?:\/\/.+\/webservice\/v1)/i);
    if (wsMatch) {
      apiUrl = wsMatch[1];
    }
    console.log(`Using base API URL: ${apiUrl}`);
    const requestedIds = new Set(client_ids.map(String));
    const onlineClientIds = new Set<string>();
    // Connection times extracted from radusuarios

    const fetchIxcEndpoint = async (endpoint: string, reqBody: Record<string, string>) => {
      const url = `${apiUrl}/${endpoint}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${encodedToken}`,
          'ixcsoft': 'listar',
        },
        body: JSON.stringify(reqBody),
      });
      const text = await res.text();
      if (text.startsWith('<') || !res.ok) {
        console.error(`${endpoint} error: ${text.substring(0, 300)}`);
        return null;
      }
      const data = JSON.parse(text);
      return {
        registros: Array.isArray(data.registros) ? data.registros : [],
        total: parseInt(data.total || '0', 10),
      };
    };

    // Fetch radusuarios with pagination
    const fetchRadusuarios = async (page: number) => {
      return fetchIxcEndpoint('radusuarios', {
        qtype: 'radusuarios.id',
        query: '1',
        oper: '>=',
        page: String(page),
        rp: '500',
        sortname: 'radusuarios.id',
        sortorder: 'asc',
      });
    };

    const firstPage = await fetchRadusuarios(1);
    
    if (firstPage) {
      console.log(`radusuarios total: ${firstPage.total}, first page: ${firstPage.registros.length} records`);

      if (firstPage.registros.length > 0) {
        const sample = firstPage.registros[0];
        console.log(`KEYS: ${Object.keys(sample).join(',')}`);
      }

      const processRecords = (registros: any[]) => {
        for (const r of registros) {
          const clientId = String(r.id_cliente || '');
          if (!clientId || !requestedIds.has(clientId)) continue;
          const online = String(r.online || '').toUpperCase() === 'S';
          if (online) {
            onlineClientIds.add(clientId);
          }

          // Extract connection times directly from radusuarios
          const ultimaConexaoInicial = String(r.ultima_conexao_inicial || '').trim();
          const ultimaConexaoFinal = String(r.ultima_conexao_final || '').trim();

          if (online && ultimaConexaoInicial && ultimaConexaoInicial !== '0000-00-00 00:00:00') {
            connectionTimes[clientId] = { since: ultimaConexaoInicial, online: true };
          } else if (!online && ultimaConexaoFinal && ultimaConexaoFinal !== '0000-00-00 00:00:00') {
            connectionTimes[clientId] = { since: ultimaConexaoFinal, online: false };
          }
        }
      };

    const result = [...onlineClientIds];
    console.log(`Final: ${result.length} online out of ${client_ids.length} requested`);

    return new Response(JSON.stringify({
      online_clients: result,
      total_online: result.length,
      connection_times: connectionTimes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message, online_clients: [], connection_times: {} }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
