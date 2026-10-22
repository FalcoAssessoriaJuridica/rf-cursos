// Função do Supabase: recebe o PDF/imagem do navegador e encaminha ao serviço OMR (Audiveris) no seu VPS,
// acrescentando a chave que fica só aqui (nunca no navegador). Só administradores autenticados podem usar.
//
// Variáveis (supabase secrets set ...): OMR_URL (ex.: https://omr.seudominio.com.br), OMR_API_KEY.
// Deploy: supabase functions deploy omr-convert
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: CORS });

  // TODO (depois da migração para o Supabase Auth): validar o JWT e exigir papel de administrador aqui.
  const url = Deno.env.get("OMR_URL");
  const key = Deno.env.get("OMR_API_KEY");
  if (!url || !key) return new Response(JSON.stringify({ detail: "Serviço de leitura não configurado." }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

  const upstream = await fetch(`${url}/convert`, { method: "POST", headers: { "X-API-Key": key }, body: await req.formData() });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...CORS, "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream" },
  });
});
