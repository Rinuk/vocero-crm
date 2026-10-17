# Plan y revisión constitucional

1. Añadir una operación autenticada de pipeline bajo `/api/bot/pipeline` y datos aditivos al contexto.
2. Resolver conversación, lead y etapas siempre con alcance de organización. Exigir etapa esperada y comparar de nuevo al escribir, para no pisar un movimiento humano concurrente.
3. Usar `moveLeadToStage` como única puerta del cambio y la bitácora; nunca escribir `stage_id` en otra ruta.
4. Publicar el evento existente `conversation.updated` tras guardar y suscribir el tablero al bus existente.
5. En n8n añadir herramientas acotadas para ficha y avance, con URLs fijas y credencial de servicio existente. Conservar los nodos de Shopify en lectura y el webhook firmado.
6. Validar aislamiento, idempotencia, pausa, cierres y conflictos con pruebas; ejecutar la aplicación con mocks y observar el tablero real.
7. Publicar el workflow, restaurar el despacho, retirar la configuración del agente incluido y redesplegar la instancia ARM.

Constitution Check: no dependencias ni migraciones nuevas; adaptación aditiva del contrato; autenticación y límite existentes; secretos permanecen cifrados; eventos después del commit; sandbox sin WhatsApp real; documentación, tipos, lint, pruebas y build como puertas de calidad. El fork del operador conserva la capacidad original del producto.
