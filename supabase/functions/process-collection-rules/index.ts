import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all active organizations with collection rules
    const { data: rules, error: rulesError } = await supabase
      .from('collection_rules')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ message: 'No active rules' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const orgIds = [...new Set(rules.map(r => r.organization_id))];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let totalCreated = 0;

    for (const orgId of orgIds) {
      const orgRules = rules.filter(r => r.organization_id === orgId);

      // Get pending boletos for this org
      const { data: boletos, error: bError } = await supabase
        .from('client_boletos')
        .select('id, timeline_id, due_date, boleto_value, status')
        .in('status', ['pendente', 'vencido']);

      if (bError) { console.error('Boletos error:', bError); continue; }

      // Filter boletos that belong to this org's timelines
      const timelineIds = [...new Set((boletos || []).map(b => b.timeline_id))];
      if (timelineIds.length === 0) continue;

      const { data: timelines } = await supabase
        .from('client_timelines')
        .select('id, client_name, organization_id')
        .eq('organization_id', orgId)
        .in('id', timelineIds);

      if (!timelines || timelines.length === 0) continue;
      const validTimelineIds = new Set(timelines.map(t => t.id));
      const nameMap = new Map(timelines.map(t => [t.id, t.client_name]));

      const orgBoletos = (boletos || []).filter(b => validTimelineIds.has(b.timeline_id));

      // Get existing pending actions to avoid duplicates
      const { data: existingActions } = await supabase
        .from('collection_actions')
        .select('boleto_id, rule_id')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'done']);

      const existingSet = new Set(
        (existingActions || []).map(a => `${a.boleto_id}:${a.rule_id}`)
      );

      const actionsToInsert: any[] = [];

      for (const boleto of orgBoletos) {
        const dueDate = new Date(boleto.due_date + 'T00:00:00');
        const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        for (const rule of orgRules) {
          // Check if this rule should trigger
          // trigger_days: negative = before due, positive = after due
          // diffDays: negative = before due, positive = after due
          if (diffDays >= rule.trigger_days) {
            const key = `${boleto.id}:${rule.id}`;
            if (existingSet.has(key)) continue;

            // Calculate action date
            const actionDate = new Date(dueDate);
            actionDate.setDate(actionDate.getDate() + rule.trigger_days);
            
            // Build message from template
            let message = rule.message_template || '';
            message = message.replace('{dias}', String(Math.abs(rule.trigger_days)));
            message = message.replace('{valor}', `R$ ${Number(boleto.boleto_value).toFixed(2)}`);
            message = message.replace('{cliente}', nameMap.get(boleto.timeline_id) || '');

            actionsToInsert.push({
              organization_id: orgId,
              timeline_id: boleto.timeline_id,
              boleto_id: boleto.id,
              rule_id: rule.id,
              action_type: rule.action_type,
              action_date: actionDate.toISOString().split('T')[0],
              message,
              status: 'pending',
            });

            existingSet.add(key);
          }
        }
      }

      // Batch insert
      if (actionsToInsert.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < actionsToInsert.length; i += chunkSize) {
          const chunk = actionsToInsert.slice(i, i + chunkSize);
          const { error: insertError } = await supabase.from('collection_actions').insert(chunk);
          if (insertError) console.error('Insert error:', insertError);
          else totalCreated += chunk.length;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, actions_created: totalCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Process rules error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
