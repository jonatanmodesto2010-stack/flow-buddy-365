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
    // Map client_id -> { login, online }
    const clientLoginMap = new Map<string, { login: string; online: boolean }>();

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
          const login = String(r.login || '');
          if (login) {
            clientLoginMap.set(clientId, { login, online });
          }
        }
      };

      processRecords(firstPage.registros);

      if (firstPage.registros.length >= 500) {
        let page = 2;
        while (page <= 200) {
          const pageData = await fetchRadusuarios(page);
          if (!pageData || !pageData.registros.length) break;
          processRecords(pageData.registros);
          if (pageData.registros.length < 500) break;
          page++;
        }
      }
    } else {
      console.log('radusuarios endpoint failed, returning empty');
    }

    // Now fetch radacct for connection times
    // We'll query for the logins we found that match requested clients
    const connectionTimes: Record<string, { since: string; online: boolean }> = {};
    
    if (clientLoginMap.size > 0) {
      console.log(`Fetching radacct for ${clientLoginMap.size} clients`);
      
      // Process in batches of logins - fetch radacct sorted by acctstarttime desc
      // For each client, we need the most recent session
      const clientEntries = [...clientLoginMap.entries()];
      
      // Batch: fetch all recent radacct records and match by username
      const loginToClientId = new Map<string, string>();
      for (const [clientId, info] of clientEntries) {
        loginToClientId.set(info.login.toLowerCase(), clientId);
      }
      
      // Fetch recent radacct records (sorted by newest first)
      let radacctPage = 1;
      const processedLogins = new Set<string>();
      const maxRadacctPages = 20; // limit pages to avoid timeout
      
      while (radacctPage <= maxRadacctPages && processedLogins.size < clientLoginMap.size) {
        const radacctData = await fetchIxcEndpoint('radacct', {
          qtype: 'radacct.id',
          query: '1',
          oper: '>=',
          page: String(radacctPage),
          rp: '500',
          sortname: 'radacct.acctstarttime',
          sortorder: 'desc',
        });

        if (!radacctData || !radacctData.registros.length) break;

        if (radacctPage === 1 && radacctData.registros.length > 0) {
          console.log(`radacct sample keys: ${Object.keys(radacctData.registros[0]).join(',')}`);
        }

        for (const r of radacctData.registros) {
          const username = String(r.username || r.login || '').toLowerCase();
          if (!username || processedLogins.has(username)) continue;
          
          const clientId = loginToClientId.get(username);
          if (!clientId) continue;

          // Found the most recent session for this login
          processedLogins.add(username);
          
          const acctstoptime = r.acctstoptime || r.datastop || null;
          const acctstarttime = r.acctstarttime || r.datastart || null;
          const isOnline = !acctstoptime || acctstoptime === '' || acctstoptime === '0000-00-00 00:00:00';

          if (isOnline && acctstarttime) {
            connectionTimes[clientId] = { since: acctstarttime, online: true };
          } else if (!isOnline && acctstoptime) {
            connectionTimes[clientId] = { since: acctstoptime, online: false };
          }
        }

        if (radacctData.registros.length < 500) break;
        radacctPage++;
      }
      
      console.log(`radacct: found times for ${Object.keys(connectionTimes).length} clients`);
    }

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
