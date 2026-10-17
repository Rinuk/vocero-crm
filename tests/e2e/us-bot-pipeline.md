# Pipeline del cerebro externo

Ejecutar `node --env-file=.env.stark-test scripts/e2e-bot-pipeline.mjs` contra la aplicación local con Postgres aislado y mocks.

- Registrar al operador y conectar WhatsApp al mock.
- Ingresar dos contactos distintos mediante el webhook simulado.
- Leer contexto y etapas mediante la credencial del bot.
- Guardar requisitos distintos en la ficha de cada chat; comprobar que no se mezclan.
- Abrir el tablero y avanzar el primer lead mediante la API del bot; observar el cambio sin recargar.
- Repetir la misma petición y verificar que no duplica el movimiento.
- Rechazar clave incorrecta, conversación ajena, retroceso, cierre ganado y actualización con contexto viejo.
- Pausar la IA y verificar que el bot no puede mover esa tarjeta.
- Confirmar que el buzón del mock no recibió mensajes salientes.
