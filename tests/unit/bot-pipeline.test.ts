import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { avanzarPipelineBot, validarAvanceBot, type EtapaBot } from "@/server/bot/pipeline";

const { getDb, moveLeadToStage, publish } = vi.hoisted(() => ({
  getDb: vi.fn(), moveLeadToStage: vi.fn(), publish: vi.fn(),
}));
vi.mock("@/lib/db", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/db")>(), getDb }));
vi.mock("@/server/leads/stage-history", () => ({ moveLeadToStage }));
vi.mock("@/server/events/bus", () => ({ publish }));

const inicial: EtapaBot = { id: "st_nuevo", name: "Nuevo", kind: "open", position: 0 };
const interes: EtapaBot = { id: "st_interes", name: "Interesado", kind: "open", position: 1 };
const ganada: EtapaBot = { id: "st_ganada", name: "Ganada", kind: "won", position: 2 };
const entrada = { organizationId: "org_stark", conversationId: "cv_a", stageId: interes.id, expectedStageId: inicial.id };
const fila = { conversation: { id: "cv_a", aiEnabled: true, isTest: false, handoffAt: null }, lead: { id: "ld_a" }, stage: inicial };

function base(resultados: unknown[][]) {
  const wheres: SQL[] = [];
  getDb.mockReturnValue({ select: () => {
    const rows = resultados.shift() ?? [];
    const c: Record<string, unknown> = {};
    c.from = () => c; c.leftJoin = () => c;
    c.where = (where: SQL) => { wheres.push(where); return c; };
    c.limit = () => Promise.resolve(rows); c.orderBy = () => Promise.resolve(rows);
    return c;
  } });
  return wheres;
}

describe("avance seguro del pipeline del bot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechaza retrocesos, cierres y contexto obsoleto", () => {
    expect(validarAvanceBot(interes, inicial, interes.id)).toBe("stage_regression");
    expect(validarAvanceBot(inicial, ganada, inicial.id)).toBe("automated_close_not_allowed");
    expect(validarAvanceBot(ganada, interes, ganada.id)).toBe("lead_closed");
    expect(validarAvanceBot(inicial, interes, "st_vieja")).toBe("stage_conflict");
  });

  it("un reintento a la misma etapa es idempotente aunque traiga el contexto anterior", async () => {
    base([[{ ...fila, stage: interes }], [inicial, interes, ganada]]);
    expect(await avanzarPipelineBot(entrada)).toMatchObject({ ok: true, changed: false });
    expect(moveLeadToStage).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("avanza por la bitácora, con comparación de etapa y evento para el tablero", async () => {
    const wheres = base([[fila], [inicial, interes, ganada]]);
    moveLeadToStage.mockResolvedValue({ ok: true, changed: true, lead: { id: "ld_a" } });
    expect(await avanzarPipelineBot(entrada)).toMatchObject({ ok: true, changed: true, lead: { stageName: "Interesado" } });
    expect(moveLeadToStage).toHaveBeenCalledWith({ organizationId: "org_stark", leadId: "ld_a", toStageId: interes.id, expectedStageId: inicial.id, source: "bot" });
    expect(publish).toHaveBeenCalledWith("org_stark", { type: "conversation.updated", data: { conversation: { id: "cv_a" } } });
    for (const where of wheres) expect(new PgDialect().sqlToQuery(where).params).toContain("org_stark");
  });

  it("una conversación ajena o inexistente no cambia ninguna tarjeta", async () => {
    base([[]]);
    expect(await avanzarPipelineBot(entrada)).toMatchObject({ ok: false, status: 404 });
    expect(moveLeadToStage).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...fila.conversation, aiEnabled: false }, "ai_paused"],
    [{ ...fila.conversation, handoffAt: new Date() }, "ai_paused"],
    [{ ...fila.conversation, isTest: true }, "sandbox_violation"],
  ])("respeta control humano y sandbox", async (conversation, code) => {
    base([[{ ...fila, conversation }]]);
    expect(await avanzarPipelineBot(entrada)).toMatchObject({ ok: false, status: 409, code });
    expect(moveLeadToStage).not.toHaveBeenCalled();
  });

  it("un movimiento humano durante la operación no se pisa ni se anuncia como guardado", async () => {
    base([[fila], [inicial, interes, ganada]]);
    moveLeadToStage.mockResolvedValue({ ok: false, reason: "lead_changed" });
    expect(await avanzarPipelineBot(entrada)).toMatchObject({ ok: false, status: 409, code: "stage_conflict" });
    expect(publish).not.toHaveBeenCalled();
  });
});
