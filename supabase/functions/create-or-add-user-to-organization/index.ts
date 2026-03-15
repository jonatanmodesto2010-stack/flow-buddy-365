import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Authenticate caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Parse & validate body ---
    const { email, password, full_name, organization_id, role } = await req.json();

    if (!email || !organization_id || !role) {
      return jsonResponse({ error: "Campos obrigatórios: email, organization_id, role" }, 400);
    }

    // --- Verify caller permissions: super_admin OR owner/admin of the org ---
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
        return jsonResponse(
          { error: "Sem permissão. Apenas owner/admin podem adicionar usuários." },
          403
        );
      }
    }

    // --- Check org user limit ---
    const { data: canAdd } = await adminClient.rpc("check_org_user_limit", {
      _org_id: organization_id,
    });
    if (!canAdd) {
      return jsonResponse(
        { error: "Limite de usuários atingido para esta organização" },
        400
      );
    }

    // --- Look up existing user by email (direct auth.users query via RPC) ---
    const { data: existingUserId } = await adminClient.rpc(
      "get_user_id_by_email",
      { _email: email }
    );

    // =============================================
    // FLOW A: User does NOT exist → create + link
    // =============================================
    if (!existingUserId) {
      if (!password) {
        return jsonResponse(
          { error: "Senha é obrigatória para criar um novo usuário" },
          400
        );
      }

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
        return jsonResponse({ error: authError.message }, 500);
      }

      const newUserId = authData.user.id;

      // Insert profile + user_role with rollback on failure
      try {
        const { error: profileError } = await adminClient
          .from("profiles")
          .upsert(
            { id: newUserId, full_name: full_name || "Usuário", organization_id },
            { onConflict: "id" }
          );
        if (profileError) throw profileError;

        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: newUserId, organization_id, role });
        if (roleError) throw roleError;
      } catch (dbError: any) {
        // Rollback: delete orphan user
        await adminClient.auth.admin.deleteUser(newUserId);
        return jsonResponse(
          { error: `Falha ao vincular usuário: ${dbError.message}. Usuário não foi criado.` },
          500
        );
      }

      return jsonResponse({
        created: true,
        linked: true,
        user_id: newUserId,
        message: "Usuário criado e vinculado à organização com sucesso",
      });
    }

    // =============================================
    // FLOW B: User EXISTS → check membership, link
    // =============================================
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", existingUserId)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (existingRole) {
      return jsonResponse({
        created: false,
        linked: false,
        user_id: existingUserId,
        message: "Usuário já pertence a esta organização",
      });
    }

    // Link user to org
    const { error: linkError } = await adminClient
      .from("user_roles")
      .insert({ user_id: existingUserId, organization_id, role });

    if (linkError) {
      return jsonResponse({ error: `Falha ao vincular: ${linkError.message}` }, 500);
    }

    // Update profile organization_id
    await adminClient
      .from("profiles")
      .update({ organization_id })
      .eq("id", existingUserId);

    return jsonResponse({
      created: false,
      linked: true,
      user_id: existingUserId,
      message: "Usuário existente vinculado à organização com sucesso",
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
});
