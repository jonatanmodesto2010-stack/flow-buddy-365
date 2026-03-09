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

function trimAlertEntries(alertText: string, maxEntries: number = 10): string {
  const parts = alertText.split(/\n(?=\[)/);
  if (parts.length <= maxEntries) return alertText;
  return parts.slice(parts.length - maxEntries).join('\n');
}

function formatAlertTimestamp(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `[${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}]`;
}

async function readIxcClient(clientUrl: string, encodedToken: string, ixcClientId: string) {
  const readRes = await fetch(clientUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
    },
    body: JSON.stringify({
      qtype: 'cliente.id',
      query: String(ixcClientId),
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
    throw { status: 502, message: 'Falha ao ler cliente no IXC', details: readText.substring(0, 300) };
  }

  const readData = JSON.parse(readText);
  const registros = Array.isArray(readData.registros) ? readData.registros : [];

  if (registros.length === 0) {
    throw { status: 404, message: 'Cliente não encontrado no IXC', ixc_client_id: ixcClientId };
  }

  return registros[0];
}

async function putIxcClient(clientUrl: string, encodedToken: string, payload: any) {
  const putRes = await fetch(clientUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
    },
    body: JSON.stringify(payload),
  });

  const putText = await putRes.text();
  console.log(`IXC PUT status: ${putRes.status}, response: ${putText.substring(0, 200)}`);

  if (!putRes.ok) {
    throw { status: 502, message: 'Falha ao atualizar alerta no IXC', details: putText.substring(0, 300) };
  }

  return putText;
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
    const { organization_id, ixc_client_id, alert_text, action, event_created_at, alert_line } = body;

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

    let clientData: any;
    try {
      clientData = await readIxcClient(clientUrl, encodedToken, ixc_client_id);
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, details: err.details, ixc_client_id: err.ixc_client_id }), {
        status: err.status || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If action is test_read, return raw client data
    if (action === 'test_read') {
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

    // Action: remove_line - remove exact line from alert (new robust method)
    if (action === 'remove_line') {
      if (!alert_line) {
        return new Response(JSON.stringify({ error: 'alert_line é obrigatório para remove_line' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentAlert = clientData.alerta || '';
      console.log(`ixc-update-alert remove_line: ixc_client=${ixc_client_id}, alert_line="${alert_line}"`);

      const lines = currentAlert.split('\n');
      const filtered = lines.filter((line: string) => line !== alert_line);

      if (filtered.length === lines.length) {
        console.log(`ixc-update-alert remove_line: no match found, skipping PUT`);
        return new Response(JSON.stringify({
          success: true,
          no_match: true,
          ixc_client_id,
          alert_line,
          message: 'Linha não encontrada no alerta, nenhuma atualização realizada',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newAlert = filtered.join('\n');
      console.log(`ixc-update-alert remove_line: removing line, new alert length=${newAlert.length}`);

      try {
        await putIxcClient(clientUrl, encodedToken, { ...clientData, alerta: newAlert });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, details: err.details, ixc_client_id }), {
          status: err.status || 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'remove_line',
        ixc_client_id,
        removed_line: alert_line,
        message: 'Linha removida do alerta com sucesso',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: remove (legacy) - remove exact line from alert by timestamp reconstruction
    if (action === 'remove') {
      if (!alert_text || !event_created_at) {
        return new Response(JSON.stringify({ error: 'alert_text e event_created_at são obrigatórios para remoção' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentAlert = clientData.alerta || '';
      const expectedLine = `${formatAlertTimestamp(event_created_at)} ${alert_text}`;

      console.log(`ixc-update-alert remove: ixc_client=${ixc_client_id}, expectedLine="${expectedLine}"`);

      const lines = currentAlert.split('\n');
      const filtered = lines.filter((line: string) => line !== expectedLine);

      if (filtered.length === lines.length) {
        console.log(`ixc-update-alert remove: no match found, skipping PUT`);
        return new Response(JSON.stringify({
          success: true,
          no_match: true,
          ixc_client_id,
          expected_line: expectedLine,
          message: 'Linha não encontrada no alerta, nenhuma atualização realizada',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newAlert = filtered.join('\n');
      try {
        await putIxcClient(clientUrl, encodedToken, { ...clientData, alerta: newAlert });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, details: err.details, ixc_client_id }), {
          status: err.status || 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'remove',
        ixc_client_id,
        removed_line: expectedLine,
        message: 'Linha removida do alerta com sucesso',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default action: add/update alert
    if (!alert_text) {
      return new Response(JSON.stringify({ error: 'alert_text é obrigatório para atualização' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamp = formatAlertTimestamp(event_created_at || new Date().toISOString());
    const currentAlert = clientData.alerta || '';
    const newEntry = `${timestamp} ${alert_text}`;
    const concatenated = currentAlert ? `${currentAlert}\n${newEntry}` : newEntry;
    const trimmedAlert = trimAlertEntries(concatenated, 10);

    console.log(`Alert: current length=${currentAlert.length}, new entry="${newEntry}", trimmed entries`);

    try {
      await putIxcClient(clientUrl, encodedToken, { ...clientData, alerta: trimmedAlert });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, details: err.details, ixc_client_id }), {
        status: err.status || 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      ixc_client_id,
      alert_text: newEntry,
      alert_line: newEntry,
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
