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

    // --- Authenticate caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: callerUser }, error: authError } =
      await adminClient.auth.getUser(token);
    if (authError || !callerUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerId = callerUser.id;

    // --- Parse body ---
    const { target_user_id, new_password, organization_id } = await req.json();

    if (!target_user_id || !new_password || !organization_id) {
      return jsonResponse({ error: "Campos obrigatórios: target_user_id, new_password, organization_id" }, 400);
    }

    if (new_password.length < 6) {
      return jsonResponse({ error: "A senha deve ter no mínimo 6 caracteres" }, 400);
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
        return jsonResponse({ error: "Sem permissão para resetar senha" }, 403);
      }

      // Verify target user belongs to the same organization
      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", target_user_id)
        .eq("organization_id", organization_id)
        .maybeSingle();

      if (!targetRole) {
        return jsonResponse({ error: "Usuário não encontrado nesta organização" }, 404);
      }

      // Non-super-admin cannot reset owner passwords
      if (targetRole.role === "owner") {
        return jsonResponse({ error: "Não é possível resetar a senha de um proprietário" }, 403);
      }

      // Admin cannot reset another admin's password (only owner can)
      if (targetRole.role === "admin" && callerRole.role !== "owner") {
        return jsonResponse({ error: "Apenas proprietários podem resetar senha de administradores" }, 403);
      }
    }

    // --- Prevent resetting own password via this endpoint ---
    if (callerId === target_user_id) {
      return jsonResponse({ error: "Use a tela de perfil para alterar sua própria senha" }, 400);
    }

    // --- Reset password ---
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error("Error resetting password:", updateError.message);
      return jsonResponse({ error: `Erro ao atualizar senha: ${updateError.message}` }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Senha resetada com sucesso",
    });
  } catch (error: any) {
    console.error("Unexpected error:", error.message);
    return jsonResponse({ error: error.message }, 500);
  }
});
