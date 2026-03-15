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

    // --- Authenticate caller using getUser ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[LOG] No valid Authorization header");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: callerUser }, error: authError } =
      await adminClient.auth.getUser(token);
    if (authError || !callerUser) {
      console.log("[LOG] Auth failed:", authError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerId = callerUser.id;
    console.log("[LOG] Caller authenticated:", callerId);

    // --- Parse & validate body ---
    const { email, password, full_name, organization_id, role } = await req.json();
    console.log("[LOG] Body parsed:", { email, organization_id, role, has_password: !!password });

    if (!email || !organization_id || !role) {
      return jsonResponse({ error: "Campos obrigatórios: email, organization_id, role" }, 400);
    }

    // --- Verify caller permissions: super_admin OR owner/admin of the org ---
    const { data: isSuperAdmin } = await adminClient
      .from("super_admins")
      .select("id")
      .eq("user_id", callerId)
      .maybeSingle();

    console.log("[LOG] Is super admin:", !!isSuperAdmin);

    if (!isSuperAdmin) {
      const { data: callerRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("organization_id", organization_id)
        .maybeSingle();

      console.log("[LOG] Caller role in org:", callerRole?.role);

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
    console.log("[LOG] Can add user (limit check):", canAdd);

    if (!canAdd) {
      return jsonResponse(
        { error: "Limite de usuários atingido para esta organização" },
        400
      );
    }

    // --- Look up existing user by email ---
    const { data: existingUserId, error: lookupError } = await adminClient.rpc(
      "get_user_id_by_email",
      { _email: email }
    );
    console.log("[LOG] Existing user lookup:", { existingUserId, lookupError: lookupError?.message });

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

      console.log("[LOG] Flow A: Creating new user...");
      const { data: authData, error: createError } =
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

      if (createError) {
        console.log("[LOG] createUser error:", createError.message);
        return jsonResponse({ error: createError.message }, 500);
      }

      const newUserId = authData.user.id;
      console.log("[LOG] User created:", newUserId);

      // Insert profile + user_role with rollback on failure
      try {
        console.log("[LOG] Upserting profile...");
        const { error: profileError } = await adminClient
          .from("profiles")
          .upsert(
            { id: newUserId, full_name: full_name || "Usuário", organization_id },
            { onConflict: "id" }
          );
        if (profileError) throw profileError;
        console.log("[LOG] Profile upserted OK");

        console.log("[LOG] Inserting user_role...");
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: newUserId, organization_id, role });
        if (roleError) throw roleError;
        console.log("[LOG] User role inserted OK");
      } catch (dbError: any) {
        console.log("[LOG] DB error, rolling back user:", dbError.message);
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
    console.log("[LOG] Flow B: User exists, checking membership...");
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", existingUserId)
      .eq("organization_id", organization_id)
      .maybeSingle();

    console.log("[LOG] Existing role in org:", existingRole);

    if (existingRole) {
      return jsonResponse({
        created: false,
        linked: false,
        user_id: existingUserId,
        message: "Usuário já pertence a esta organização",
      });
    }

    // Ensure profile exists before linking
    console.log("[LOG] Ensuring profile exists for existing user...");
    const { error: ensureProfileError } = await adminClient
      .from("profiles")
      .upsert(
        { id: existingUserId, full_name: full_name || "Usuário", organization_id },
        { onConflict: "id" }
      );
    if (ensureProfileError) {
      console.log("[LOG] Failed to ensure profile:", ensureProfileError.message);
      return jsonResponse({ error: `Failed to create profile: ${ensureProfileError.message}` }, 500);
    }
    console.log("[LOG] Profile ensured OK");

    // Link user to org
    console.log("[LOG] Linking existing user to org...");
    const { error: linkError } = await adminClient
      .from("user_roles")
      .insert({ user_id: existingUserId, organization_id, role });

    if (linkError) {
      console.log("[LOG] Link error:", linkError.message);
      return jsonResponse({ error: `Falha ao vincular: ${linkError.message}` }, 500);
    }

    // Update profile organization_id
    console.log("[LOG] Updating profile org...");
    await adminClient
      .from("profiles")
      .update({ organization_id })
      .eq("id", existingUserId);

    console.log("[LOG] Done - user linked successfully");
    return jsonResponse({
      created: false,
      linked: true,
      user_id: existingUserId,
      message: "Usuário existente vinculado à organização com sucesso",
    });
  } catch (error: any) {
    console.log("[LOG] Unexpected error:", error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
