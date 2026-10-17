# Contrato aditivo del pipeline del bot

Todas las operaciones usan `X-API-Key`, la organización de la instancia y el presupuesto existente del bot.

`GET /api/bot/pipeline`: `{stages:[{id,name,kind,position}]}`.

`PATCH /api/bot/pipeline`: `{conversationId,stageId,expectedStageId}`. Respuesta `{lead:{id,stageId,stageName},changed}`. Solo avances entre etapas `open`; la misma etapa es una operación idempotente. Un contexto viejo produce `409 stage_conflict`, el control humano `409 ai_paused`, el sandbox `409 sandbox_violation`, un lead cerrado `409 lead_closed`, un cierre automático `422 automated_close_not_allowed` y un retroceso `422 stage_regression`. Conversación ajena/inexistente: `404 not_found`; etapa inválida: `422 invalid_stage`.

`GET /api/bot/context` añade `pipeline.stages` y `lead.stageId`, `lead.stageKind`, `lead.stagePosition`; conserva todas las claves anteriores.
