import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Auth: validate caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Parse body ---
    const { email, password, full_name, organization_id, role } =
      await req.json();

    if (!email || !organization_id || !role) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, organization_id, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Verify caller is owner/admin of the org OR super_admin ---
    const { data: isSuperAdmin } = await adminClient
      .from("super_admins")
      .select("id")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!isSuperAdmin) {
      const { data: callerRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("organization_id", organization_id)
        .maybeSingle();

      if (!callerRole || !["owner", "admin"].includes(callerRole.role)) {
        return new Response(
          JSON.stringify({ error: "Sem permissão. Apenas owner/admin podem adicionar usuários." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Check org user limit ---
    const { data: canAdd } = await adminClient.rpc("check_org_user_limit", {
      _org_id: organization_id,
    });
    if (!canAdd) {
      return new Response(
        JSON.stringify({ error: "Limite de usuários atingido para esta organização" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Check if user already exists in auth.users ---
    const { data: existingUsers, error: lookupError } = await adminClient
      .from("auth.users" as any)
      .select("id")
      .eq("email", email)
      .limit(1);

    // Fallback: direct RPC if the above doesn't work on auth schema
    let existingUserId: string | null = null;

    if (lookupError) {
      // Use admin API to look up by email
      const { data: listData } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      // Filter manually — but this is not ideal. Let's try getUserByEmail instead.
    }

    // Best approach: use admin.getUserByEmail (available in newer supabase-js)
    // Actually, let's use the admin listUsers with a filter approach via RPC
    // The most reliable way: try to sign in or use admin API getUserById
    // Let's use a direct SQL query via RPC

    // Since we can't query auth.users directly from the client library,
    // let's use admin.auth.admin.listUsers and filter, but limit scope
    // Actually the best approach for Supabase edge functions is:
    
    const { data: userLookup, error: userLookupError } = await adminClient
      .rpc("get_user_id_by_email" as any, { _email: email });

    // If the RPC doesn't exist yet, fall back to admin API
    if (userLookupError) {
      // Use admin.auth.admin to find user - get all matching
      // We'll create a simpler approach using the auth admin API
      const response = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?filter=email%20eq%20${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        const users = result.users || result;
        if (Array.isArray(users) && users.length > 0) {
          existingUserId = users[0].id;
        }
      }
    } else if (userLookup) {
      existingUserId = typeof userLookup === "string" ? userLookup : null;
    }

    // --- Flow: user does NOT exist ---
    if (!existingUserId) {
      if (!password) {
        return new Response(
          JSON.stringify({
            error: "Senha é obrigatória para criar um novo usuário",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user
      const { data: authData, error: authError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: full_name || "Usuário",
            created_by_admin: true,
            organization_id,
            role,
          },
        });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = authData.user.id;

      // Insert profile + user_role
      try {
        const { error: profileError } = await adminClient
          .from("profiles")
          .upsert({
            id: newUserId,
            full_name: full_name || "Usuário",
            organization_id,
          }, { onConflict: "id" });

        if (profileError) throw profileError;

        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({
            user_id: newUserId,
            organization_id,
            role,
          });

        if (roleError) throw roleError;
      } catch (dbError: any) {
        // Rollback: delete user to prevent orphan
        await adminClient.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({
            error: `Falha ao vincular usuário: ${dbError.message}. Usuário não foi criado.`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          created: true,
          linked: true,
          user_id: newUserId,
          message: "Usuário criado e vinculado à organização com sucesso",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Flow: user EXISTS ---
    // Check if already in org
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", existingUserId)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (existingRole) {
      return new Response(
        JSON.stringify({
          created: false,
          linked: false,
          user_id: existingUserId,
          message: "Usuário já pertence a esta organização",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Link to org
    const { error: linkRoleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: existingUserId,
        organization_id,
        role,
      });

    if (linkRoleError) {
      return new Response(
        JSON.stringify({ error: `Falha ao vincular: ${linkRoleError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update profile organization_id
    await adminClient
      .from("profiles")
      .update({ organization_id })
      .eq("id", existingUserId);

    return new Response(
      JSON.stringify({
        created: false,
        linked: true,
        user_id: existingUserId,
        message: "Usuário existente vinculado à organização com sucesso",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
