import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { avanzarPipelineBot, etapasParaBot } from "@/server/bot/pipeline";

export const dynamic = "force-dynamic";

const entrada = z.object({
  conversationId: z.string().min(1),
  stageId: z.string().min(1),
  expectedStageId: z.string().min(1),
});

export async function GET(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;
  const org = await resolveInstanceOrg();
  if (!org) return apiError(409, "no_org", "La instancia aún no tiene organización");
  return Response.json({ stages: await etapasParaBot(org) });
}

export async function PATCH(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;
  const org = await resolveInstanceOrg();
  if (!org) return apiError(409, "no_org", "La instancia aún no tiene organización");
  const parsed = await parseBody(req, entrada);
  if (!parsed.ok) return parsed.response;
  const result = await avanzarPipelineBot({ organizationId: org, ...parsed.data });
  if (!result.ok) return apiError(result.status, result.code,
    "No se pudo avanzar la etapa automáticamente; consulta de nuevo el contexto o continúa con el equipo");
  return Response.json({ lead: result.lead, changed: result.changed });
}
