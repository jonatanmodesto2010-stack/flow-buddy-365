import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isSuperAdmin } = await adminClient
      .from("super_admins")
      .select("id")
      .eq("user_id", callerUser.user.id)
      .maybeSingle();

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Super admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create_organization") {
      const { name, plan, max_users, max_clients, admin_email, admin_password, admin_name } = body;

      if (!name || !admin_email || !admin_password) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
      }

      // Create organization
      const { data: org, error: orgError } = await adminClient
        .from("organizations")
        .insert({
          name,
          plan: plan || "basic",
          max_users: max_users || 5,
          max_clients: max_clients || 100,
          status: "active",
        })
        .select()
        .single();

      if (orgError) {
        return new Response(JSON.stringify({ error: orgError.message }), { status: 500, headers: corsHeaders });
      }

      // Create admin user
      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: {
          full_name: admin_name || "Administrador",
          created_by_admin: true,
          organization_id: org.id,
          role: "owner",
        },
      });

      if (authError) {
        // Rollback: delete org
        await adminClient.from("organizations").delete().eq("id", org.id);
        return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ organization: org, user: { id: authUser.user.id, email: authUser.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_organization") {
      const { id, ...updates } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing organization id" }), { status: 400, headers: corsHeaders });
      }

      const { data, error } = await adminClient
        .from("organizations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ organization: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "suspend_organization") {
      const { id, suspend } = body;
      const { data, error } = await adminClient
        .from("organizations")
        .update({
          status: suspend ? "suspended" : "active",
          suspended_at: suspend ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ organization: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_user_to_org") {
      const { organization_id, email, password, full_name, role } = body;

      // Check limits
      const { data: canAdd } = await adminClient.rpc("check_org_user_limit", { _org_id: organization_id });
      if (!canAdd) {
        return new Response(JSON.stringify({ error: "Limite de usuários atingido para esta organização" }), { status: 400, headers: corsHeaders });
      }

      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || "Usuário",
          created_by_admin: true,
          organization_id,
          role: role || "member",
        },
      });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ user: { id: authUser.user.id, email: authUser.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_user_password") {
      const { email, new_password } = body;
      if (!email || !new_password) {
        return new Response(JSON.stringify({ error: "Missing email or new_password" }), { status: 400, headers: corsHeaders });
      }

      const { data: users, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: corsHeaders });
      }

      const targetUser = users.users.find((u: any) => u.email === email);
      if (!targetUser) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: corsHeaders });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, {
        password: new_password,
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, message: "Password updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
