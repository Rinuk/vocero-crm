/** Verifica el contrato del cerebro externo con Postgres y WhatsApp locales. */
import assert from 'node:assert/strict';
import postgres from 'postgres';
const base = process.env.APP_BASE_URL;
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):/);
assert.equal(process.env.WA_MOCK_ENABLED, 'true');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let cookie = '';
let checks = 0;
async function call(path, {method='GET', body, bot=false, key=process.env.BOT_API_KEY}={}) {
  const r = await fetch(base+path, {method, headers:{'content-type':'application/json',origin:base,
    ...(bot?{'x-api-key':key}:{cookie})}, ...(body?{body:JSON.stringify(body)}:{})});
  const cookies=r.headers.getSetCookie();
  if(cookies.length) cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  return {status:r.status, body:await r.json()};
}
function check(name, condition) { assert.ok(condition, name); checks++; console.log('✓ '+name); }
try {
  let login=await call('/api/auth/sign-up/email',{method:'POST',body:{email:'e2e@vocero.test',password:'password-e2e-123',name:'Operador E2E'}});
  if(login.status!==200) login=await call('/api/auth/sign-in/email',{method:'POST',body:{email:'e2e@vocero.test',password:'password-e2e-123'}});
  check('operador autenticado',login.status===200);
  const pn='PN-PIPELINE-STARK';
  check('WhatsApp conectado al mock',(await call('/api/settings/whatsapp',{method:'PUT',body:{wabaId:'WABA-LOCAL',phoneNumberId:pn,token:'local-mock'}})).status===200);
  await call('/api/dev/wa-mock/outbox',{method:'DELETE'});
  const stamp=Date.now().toString().slice(-8);
  const chats=[];
  for(let i=0;i<2;i++) {
    const name=`Pipeline${stamp}-${i}`;
    await call('/api/dev/wa-mock/inbound',{method:'POST',body:{phoneNumberId:pn,from:`569${stamp}${i}`,name,text:'Busco una cerradura',waMessageId:`wamid.local.${stamp}.${i}`}});
    let chat;
    for(let n=0;n<40&&!chat;n++) {
      await new Promise(r=>setTimeout(r,250));
      chat=(await call('/api/conversations')).body.conversations?.find(c=>c.contact.name===name);
    }
    check('chat local '+i+' creado',!!chat); chats.push(chat);
  }
  const context=async i=>(await call('/api/bot/context?conversationId='+chats[i].id,{bot:true})).body;
  const c=await context(0);
  const stages=c.pipeline.stages;
  const open=stages.filter(s=>s.kind==='open');
  check('contexto incluye etapas y etapa actual',open.length>=3&&c.lead.stageId===open[0].id);
  for(let i=0;i<2;i++) await call('/api/bot/ficha',{bot:true,method:'PUT',body:{conversationId:chats[i].id,ficha:{material_puerta:i?'metal':'madera',espesor_mm:i?50:40}}});
  check('fichas y memoria de requisitos aisladas por chat',(await context(0)).contact.ficha.material_puerta==='madera'&&(await context(1)).contact.ficha.material_puerta==='metal');
  const move=async(stage,expected=open[0].id,id=chats[0].id)=>call('/api/bot/pipeline',{bot:true,method:'PATCH',body:{conversationId:id,stageId:stage,expectedStageId:expected}});
  check('rechaza API key incorrecta',(await call('/api/bot/pipeline',{bot:true,key:'incorrecta'})).status===401);
  check('rechaza conversación inexistente',(await move(open[1].id,open[0].id,'cv_ajena')).status===404);
  const first=await move(open[1].id);
  check('avanza a etapa abierta',first.status===200&&first.body.changed===true);
  const repeat=await move(open[1].id);
  check('repetición idempotente',repeat.status===200&&repeat.body.changed===false);
  check('contexto viejo no mueve tarjeta',(await move(open[2].id)).status===409);
  check('no retrocede',(await move(open[0].id,open[1].id)).status===422);
  check('no cierra ventas',(await move(stages.find(s=>s.kind==='won').id,open[1].id)).status===422);
  const events=await sql`select * from lead_stage_event where lead_id=${c.lead.id} order by created_at`;
  check('un movimiento real deja exactamente una entrada bot',events.filter(e=>e.source==='bot').length===1);
  const board=(await call('/api/pipeline/board')).body;
  check('tablero refleja avance',board.leads.find(l=>l.id===c.lead.id).stageId===open[1].id);
  await call('/api/conversations/'+chats[0].id,{method:'PATCH',body:{aiEnabled:false}});
  check('pausa humana bloquea movimientos',(await move(open[2].id,open[1].id)).status===409);
  check('segundo chat sigue en su etapa',(await context(1)).lead.stageId===open[0].id);
  check('ningún mensaje real ni simulado saliente',(await call('/api/dev/wa-mock/outbox')).body.outbox.length===0);
  console.log(`${checks} comprobaciones correctas. Chats UI: ${chats.map(c=>c.contact.name).join(', ')}`);
} finally { await sql.end(); }
