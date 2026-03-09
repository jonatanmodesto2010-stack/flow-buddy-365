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
  // If URL already contains /webservice/v1, extract up to that point
  const idx = url.toLowerCase().indexOf('/webservice/v1');
  if (idx !== -1) {
    url = url.substring(0, idx + '/webservice/v1'.length);
  } else {
    // Append /webservice/v1 if not present
    url = `${url}/webservice/v1`;
  }
  return url;
}

function trimAlertEntries(alertText: string, maxEntries: number = 10): string {
  // Split by newline followed by [ (our entry marker)
  const parts = alertText.split(/\n(?=\[)/);
  if (parts.length <= maxEntries) return alertText;
  // Keep only the last maxEntries
  return parts.slice(parts.length - maxEntries).join('\n');
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

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { organization_id, ixc_client_id, alert_text, action } = body;

    console.log(`ixc-update-alert: action=${action || 'update'}, org=${organization_id}, ixc_client=${ixc_client_id}`);

    if (!organization_id || !ixc_client_id) {
      return new Response(JSON.stringify({ error: 'organization_id e ixc_client_id são obrigatórios' }), {
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
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada ou inativa' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = normalizeApiUrl(integration.api_url);
    const encodedToken = encodeIxcToken(integration.api_token);
    const clientUrl = `${baseUrl}/cliente/${ixc_client_id}`;

    console.log(`Reading IXC client at: ${clientUrl}`);

    // Step 1: Read current client data
    const readRes = await fetch(clientUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedToken}`,
        'ixcsoft': 'listar',
      },
      body: JSON.stringify({
        qtype: 'cliente.id',
        query: String(ixc_client_id),
        oper: '=',
        page: '1',
        rp: '1',
        sortname: 'cliente.id',
        sortorder: 'asc',
      }),
    });

    const readText = await readRes.text();
    console.log(`IXC read status: ${readRes.status}, length: ${readText.length}`);

    if (!readRes.ok || readText.startsWith('<')) {
      console.error(`IXC read error: ${readText.substring(0, 300)}`);
      return new Response(JSON.stringify({
        error: 'Falha ao ler cliente no IXC',
        details: readText.substring(0, 300),
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const readData = JSON.parse(readText);
    const registros = Array.isArray(readData.registros) ? readData.registros : [];

    if (registros.length === 0) {
      return new Response(JSON.stringify({
        error: 'Cliente não encontrado no IXC',
        ixc_client_id,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientData = registros[0];

    // If action is test_read, return raw client data
    if (action === 'test_read') {
      console.log(`test_read: returning raw data for client ${ixc_client_id}`);
      return new Response(JSON.stringify({
        success: true,
        action: 'test_read',
        ixc_client_id,
        raw_data: clientData,
        alerta_atual: clientData.alerta || '',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Concatenate alert text
    if (!alert_text) {
      return new Response(JSON.stringify({ error: 'alert_text é obrigatório para atualização' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `[${dd}/${mm}/${yyyy} ${hh}:${min}]`;

    const currentAlert = clientData.alerta || '';
    const newEntry = `${timestamp} ${alert_text}`;
    const concatenated = currentAlert ? `${currentAlert}\n${newEntry}` : newEntry;
    const trimmedAlert = trimAlertEntries(concatenated, 10);

    console.log(`Alert: current length=${currentAlert.length}, new entry="${newEntry}", trimmed entries`);

    // Step 3: PUT with full payload, only changing alerta
    const updatePayload = { ...clientData, alerta: trimmedAlert };

    const putRes = await fetch(clientUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedToken}`,
      },
      body: JSON.stringify(updatePayload),
    });

    const putText = await putRes.text();
    console.log(`IXC PUT status: ${putRes.status}, response: ${putText.substring(0, 200)}`);

    if (!putRes.ok) {
      console.error(`IXC PUT error: ${putText.substring(0, 500)}`);
      return new Response(JSON.stringify({
        error: 'Falha ao atualizar alerta no IXC',
        details: putText.substring(0, 300),
        ixc_client_id,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      ixc_client_id,
      alert_text: newEntry,
      message: 'Alerta atualizado com sucesso no IXC',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('ixc-update-alert error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
