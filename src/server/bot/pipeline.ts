import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { publish } from "@/server/events/bus";

export type EtapaBot = {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  position: number;
};

/** El bot califica oportunidades; los cierres y retrocesos los decide el equipo. */
export function validarAvanceBot(actual: EtapaBot, destino: EtapaBot, esperada: string) {
  if (actual.kind !== "open") return "lead_closed" as const;
  if (destino.kind !== "open") return "automated_close_not_allowed" as const;
  if (actual.id === destino.id) return null;
  if (actual.id !== esperada) return "stage_conflict" as const;
  if (destino.position < actual.position) return "stage_regression" as const;
  return null;
}

export async function etapasParaBot(organizationId: string): Promise<EtapaBot[]> {
  const db = getDb();
  return db.select({
    id: schema.pipelineStage.id,
    name: schema.pipelineStage.name,
    kind: schema.pipelineStage.kind,
    position: schema.pipelineStage.position,
  }).from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
}

type EntradaAvance = {
  organizationId: string;
  conversationId: string;
  stageId: string;
  expectedStageId: string;
};

export async function avanzarPipelineBot(input: EntradaAvance) {
  const db = getDb();
  const rows = await db.select({
    conversation: schema.conversation,
    lead: schema.lead,
    stage: schema.pipelineStage,
  }).from(schema.conversation)
    .leftJoin(schema.lead, and(
      eq(schema.lead.contactId, schema.conversation.contactId),
      eq(schema.lead.organizationId, input.organizationId),
    ))
    .leftJoin(schema.pipelineStage, and(
      eq(schema.pipelineStage.id, schema.lead.stageId),
      eq(schema.pipelineStage.organizationId, input.organizationId),
    ))
    .where(scoped(schema.conversation.organizationId, input.organizationId,
      eq(schema.conversation.id, input.conversationId)))
    .limit(1);
  const row = rows[0];
  if (!row?.lead || !row.stage) return { ok: false as const, code: "not_found", status: 404 };
  if (row.conversation.isTest) return { ok: false as const, code: "sandbox_violation", status: 409 };
  if (!row.conversation.aiEnabled || row.conversation.handoffAt) {
    return { ok: false as const, code: "ai_paused", status: 409 };
  }
  const stages = await etapasParaBot(input.organizationId);
  const target = stages.find(s => s.id === input.stageId);
  if (!target) return { ok: false as const, code: "invalid_stage", status: 422 };
  const blocked = validarAvanceBot(row.stage, target, input.expectedStageId);
  if (blocked) return { ok: false as const, code: blocked,
    status: blocked === "lead_closed" || blocked === "stage_conflict" ? 409 : 422 };
  if (row.stage.id === target.id) {
    return { ok: true as const, changed: false,
      lead: { id: row.lead.id, stageId: target.id, stageName: target.name } };
  }
  const result = await moveLeadToStage({
    organizationId: input.organizationId,
    leadId: row.lead.id,
    toStageId: target.id,
    expectedStageId: row.stage.id,
    source: "bot",
  });
  if (!result.ok) return { ok: false as const,
    code: result.reason === "lead_changed" ? "stage_conflict" : "not_found",
    status: result.reason === "lead_changed" ? 409 : 404 };
  publish(input.organizationId, { type: "conversation.updated",
    data: { conversation: { id: input.conversationId } } });
  return { ok: true as const, changed: result.changed,
    lead: { id: result.lead.id, stageId: target.id, stageName: target.name } };
}
