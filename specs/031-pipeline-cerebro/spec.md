# 031 — Pipeline para el cerebro externo

Carril: ciclo completo, declarado antes de implementar. El cambio amplía de forma aditiva la API pública del bot; no cambia el modelo de datos.

## Problema y resultado

El asesor externo recuerda la conversación pero no puede avanzar la tarjeta del cliente ni mostrar sus decisiones en el tablero. Debe consultar las etapas reales, guardar los requisitos en la ficha y avanzar oportunidades abiertas cuando el diálogo lo justifique, sin interferir con una persona.

## Aceptación

- El contexto del bot conserva su contrato y añade el ID de etapa y las etapas disponibles.
- Una petición autenticada puede avanzar una conversación activa a otra etapa abierta; usa la bitácora existente y se refleja en bandeja y tablero sin recargar.
- Una repetición hacia la misma etapa no duplica eventos.
- La operación rechaza otra organización, conversación pausada/de prueba, cierre automático, retroceso y contexto de etapa desactualizado.
- La ficha conserva datos confirmados del cliente; el agente no guarda precios ni disponibilidad como memoria durable.
- La memoria de n8n se identifica por organización y conversación, conserva historial persistente tras reinicios y se limpia al eliminar el chat.
- No se envían mensajes reales durante las pruebas locales.

## Fuera de alcance

No crear pedidos ni modificar Shopify, cobros, importes del negocio, cierres ganados/perdidos o credenciales de Meta. No añadir un proveedor externo al núcleo. La retirada de la configuración del agente incluido es una operación de esta instancia, no una eliminación de la función del producto.
