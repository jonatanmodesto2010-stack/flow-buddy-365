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
    console.log('ixc-check-online: v3 starting');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { organization_id, client_ids } = body;
    console.log(`org: ${organization_id}, clients count: ${client_ids?.length || 0}`);

    if (!organization_id || !client_ids?.length) {
      return new Response(JSON.stringify({ online_clients: [], total_online: 0 }), {
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
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada', online_clients: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedToken = encodeIxcToken(integration.api_token);
    // The api_url may contain /fn_areceber or other sub-paths
    // radusuarios needs the base webservice URL, so strip any sub-path after /webservice/v1
    let apiUrl = integration.api_url.replace(/\/$/, '');
    // Extract base URL up to /webservice/v1
    const wsMatch = apiUrl.match(/(https?:\/\/.+\/webservice\/v1)/i);
    if (wsMatch) {
      apiUrl = wsMatch[1];
    }
    console.log(`Using base API URL: ${apiUrl}`);
    const requestedIds = new Set(client_ids.map(String));
    const onlineClientIds = new Set<string>();

    // Use exact same format as the PHP example: qtype = 'radusuarios.id'
    const fetchRadusuarios = async (page: number) => {
      const url = `${apiUrl}/radusuarios`;
      const reqBody = {
        qtype: 'radusuarios.id',
        query: '1',
        oper: '>=',
        page: String(page),
        rp: '500',
        sortname: 'radusuarios.id',
        sortorder: 'asc',
      };

      console.log(`Fetching radusuarios page ${page}, url: ${url}`);

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
      console.log(`Response status: ${res.status}, length: ${text.length}, starts with: ${text.substring(0, 80)}`);

      if (text.startsWith('<') || !res.ok) {
        console.error(`HTML/Error response: ${text.substring(0, 300)}`);
        return null;
      }

      const data = JSON.parse(text);
      return {
        registros: Array.isArray(data.registros) ? data.registros : [],
        total: parseInt(data.total || '0', 10),
      };
    };

    // Try page 1
    const firstPage = await fetchRadusuarios(1);
    
    if (firstPage) {
      console.log(`radusuarios total: ${firstPage.total}, first page: ${firstPage.registros.length} records`);
      
      if (firstPage.registros.length > 0) {
        const sample = firstPage.registros[0];
        const keys = Object.keys(sample);
        console.log(`KEYS: ${keys.join(',')}`);
        const relevant: Record<string, any> = {};
        for (const k of keys) {
          if (k.includes('online') || k.includes('cliente') || k.includes('ativo') || 
              k.includes('status') || k === 'id' || k === 'login') {
            relevant[k] = sample[k];
          }
        }
        console.log(`Sample: ${JSON.stringify(relevant)}`);
      }

      // Process all pages
      const processRecords = (registros: any[]) => {
        for (const r of registros) {
          const clientId = String(r.id_cliente || '');
          if (!clientId || !requestedIds.has(clientId)) continue;
          const online = String(r.online || '').toUpperCase();
          if (online === 'S') {
            onlineClientIds.add(clientId);
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

    const result = [...onlineClientIds];
    console.log(`Final: ${result.length} online out of ${client_ids.length} requested`);

    return new Response(JSON.stringify({
      online_clients: result,
      total_online: result.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message, online_clients: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
