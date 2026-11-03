'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../store');
const {runReminders}=require('../engine');
const {DAY,HOUR,keyFor,inspect,nextSchedule,display}=require('../policy');
const {resendAdapter,calendarAdapter}=require('../adapters');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function memoryDb() {
  const data=new Map(); let queue=Promise.resolve(), failAccept=false;
  const copy=x=>x===undefined?undefined:structuredClone(x);
  const snap=p=>({id:p.split('/').pop(),exists:data.has(p),data:()=>copy(data.get(p))});
  class Ref {
    constructor(p){this.path=p;this.id=p.split('/').pop();}
    collection(p){return new Query(this.path+'/'+p);}
    async get(){return snap(this.path);}
  }
  class Query {
    constructor(p,filter=null,cap=Infinity){this.path=p;this.filter=filter;this.cap=cap;}
    doc(id){return new Ref(this.path+'/'+id);}
    where(k,op,v){assert.equal(op,'==');return new Query(this.path,[k,v],this.cap);}
    limit(n){return new Query(this.path,this.filter,n);}
    async get(){return {docs:[...data].filter(([p,d])=>p.startsWith(this.path+'/')&&!p.slice(this.path.length+1).includes('/')&&(!this.filter||d[this.filter[0]]===this.filter[1])).slice(0,this.cap).map(([p])=>snap(p))};}
  }
  return {data,failNextAcceptance(){failAccept=true;},collection:p=>new Query(p),
    async runTransaction(fn){
      const previous=queue;let release;queue=new Promise(r=>release=r);await previous;
      try {
        const writes=[];
        const result=await fn({get:async ref=>snap(ref.path),set:(r,d)=>writes.push([r.path,d,'set']),create:(r,d)=>writes.push([r.path,d,'create']),update:(r,d)=>writes.push([r.path,d,'update'])});
        if(failAccept&&writes.some(([,d])=>d.state==='accepted')){failAccept=false;throw Error('Mock persistence interruption');}
        for(const [p,d,type]of writes){if(type==='create')assert(!data.has(p));if(type==='update')assert(data.has(p));data.set(p,type==='update'?{...data.get(p),...copy(d)}:copy(d));}
        return result;
      } finally{release();}
    }};
}
const originalTime=Date.parse('2026-12-09T11:00:00Z');
function event(start=originalTime,overrides={}) {
  return {id:'test-event',status:'confirmed',start:{dateTime:new Date(start).toISOString()},end:{dateTime:new Date(start+45*60000).toISOString()},extendedProperties:{private:{trimziReminder:'v1',reminderEmail:'customer@example.test',reminderService:'Scissor cut',reminderBarber:'Ian',reminderStartISO:new Date(start).toISOString(),reminderEnrolledAt:new Date(originalTime-7*DAY).toISOString(),reminderScheduledAt:new Date(originalTime-7*DAY).toISOString(),reminderRevision:'initial',...overrides}}};
}
function fixture(options={}) {
  const db=memoryDb(),store=createStore(db),key=keyFor('calendar','test-event');
  const f={db,store,key,time:originalTime-DAY,event:event(),sends:[],gets:0,profileCalls:0,...options};
  f.calendar={id:'calendar',discover:async()=>f.event?[structuredClone(f.event)]:[],get:async()=>{f.gets++;if(f.onGet)await f.onGet();if(f.readError)throw Error('Mock Calendar outage');return f.event?structuredClone(f.event):null;}};
  f.run=()=>runReminders({enabled:f.enabled!==false,store,calendar:f.calendar,from:f.from||'bookings@example.test',now:()=>f.time,
    profile:async()=>{f.profileCalls++;if(f.profileError)throw Error('Mock profile outage');return f.preference!==false;},
    send:async(payload,id)=>{f.sends.push({payload:structuredClone(payload),id});if(f.onSend)await f.onSend();return f.result||{accepted:true,id:'provider-id'};}});
  f.parent=()=>db.data.get('appointmentReminders/'+key);
  f.episode=(revision=f.parent()?.revision)=>db.data.get('appointmentReminders/'+key+'/episodes/'+revision);
  return f;
}

test('disabled worker does no reads or writes',async()=>{const f=fixture({enabled:false});f.calendar.discover=()=>{throw Error('must not read');};assert.deepEqual(await f.run(),{disabled:true});assert.equal(f.db.data.size,0);});
for(const uid of [null,'user1']) for(const payment of ['pay_now','pay_later'])test(`one reminder for ${uid?'registered':'guest'} ${payment}`,async()=>{const f=fixture();f.event.extendedProperties.private.paymentMethod=payment;if(uid)f.event.extendedProperties.private.bookingOwnerUid=uid;await f.run();await f.run();assert.equal(f.sends.length,1);assert.equal(f.profileCalls,uid?1:0);assert.equal(f.episode().state,'accepted');assert.equal(f.event.extendedProperties.private.paymentMethod,payment);});
test('before due no send, at due sends',async()=>{const f=fixture({time:originalTime-DAY-1});await f.run();assert.equal(f.sends.length,0);f.time++;await f.run();assert.equal(f.sends.length,1);});
for(const offset of [-1,0,1])test(`strict creation lead 24h ${offset}`,async()=>{const f=fixture();f.event.extendedProperties.private.reminderEnrolledAt=new Date(originalTime-DAY-offset).toISOString();f.event.extendedProperties.private.reminderScheduledAt=f.event.extendedProperties.private.reminderEnrolledAt;await f.run();assert.equal(f.sends.length,offset>0?1:0);});
for(const late of [30*60000,HOUR,HOUR+1])test(`catch up ${late}`,async()=>{const f=fixture({time:originalTime-DAY+late});await f.run();assert.equal(f.sends.length,late<=HOUR?1:0);});
test('legacy and unrelated appointments excluded',async()=>{const f=fixture();delete f.event.extendedProperties.private.trimziReminder;await f.run();assert.equal(f.db.data.size,0);assert.equal(f.sends.length,0);});
for(const email of ['', 'invalid', 'x'.repeat(321)+'@example.test'])test(`invalid recipient ${email.length}`,async()=>{const f=fixture();f.event.extendedProperties.private.reminderEmail=email;await f.run();assert.equal(f.sends.length,0);});
test('invalid duration never repaired or sent',async()=>{const f=fixture();f.event.end.dateTime=new Date(originalTime+30*60000).toISOString();await f.run();assert.equal(f.sends.length,0);assert.equal(Date.parse(f.event.end.dateTime)-originalTime,30*60000);});
test('all day and recurring excluded',()=>{const e=event();e.start={date:'2026-12-09'};assert.equal(inspect(e,originalTime-DAY),null);const r=event();r.recurringEventId='series';assert.equal(inspect(r,originalTime-DAY),null);});
test('opt out suppresses and missing preference enables',async()=>{const f=fixture({preference:false});f.event.extendedProperties.private.bookingOwnerUid='user1';await f.run();assert.equal(f.sends.length,0);assert.equal(f.episode().state,'skipped');});
test('profile read failure defers instead of enabling',async()=>{const f=fixture({profileError:true});f.event.extendedProperties.private.bookingOwnerUid='user1';await f.run();assert.equal(f.sends.length,0);f.profileError=false;f.time+=30*60000;await f.run();assert.equal(f.sends.length,1);});
for(const cancelled of [null,'cancelled'])test(`cancelled Calendar ${cancelled} despite stale ledger`,async()=>{const f=fixture({time:originalTime-2*DAY});await f.run();if(cancelled)f.event.status=cancelled;else f.event=null;f.time=originalTime-DAY;await f.run();assert.equal(f.sends.length,0);assert.equal(f.parent().active,false);});
test('transient Calendar failure defers',async()=>{const f=fixture({readError:true});await f.run();assert.equal(f.sends.length,0);f.readError=false;await f.run();assert.equal(f.sends.length,1);});
test('cancellation during final check stops sending',async()=>{const f=fixture();f.onGet=()=>{if(f.gets===2)f.event.status='cancelled';};await f.run();assert.equal(f.sends.length,0);});
test('payment-only updates do not rearm accepted episode',async()=>{const f=fixture();await f.run();f.event.updated=new Date(f.time).toISOString();f.event.extendedProperties.private.paymentStatus='paid';await f.run();assert.equal(f.parent().revision,1);assert.equal(f.sends.length,1);});
test('later app move after prior reminder gets new reminder',async()=>{const f=fixture();await f.run();f.event=event(originalTime+7*DAY,{reminderRevision:'move-1',reminderScheduledAt:new Date(f.time).toISOString()});await f.run();assert.equal(f.parent().revision,2);f.time=originalTime+6*DAY;await f.run();assert.equal(f.sends.length,2);assert.notEqual(f.sends[0].id,f.sends[1].id);});
for(const offset of [-1,0,1])test(`app move lead 24h ${offset}`,async()=>{const f=fixture({time:originalTime-3*DAY});await f.run();const dest=f.time+DAY+offset;f.event=event(dest,{reminderRevision:'move',reminderScheduledAt:new Date(f.time).toISOString()});await f.run();assert.equal(f.parent().schedule.eligible,offset>0);});
test('manual move within24h conservatively skipped',async()=>{const f=fixture({time:originalTime-3*DAY});await f.run();f.event.start.dateTime=new Date(f.time+12*HOUR).toISOString();f.event.end.dateTime=new Date(f.time+12*HOUR+45*60000).toISOString();await f.run();assert.equal(f.parent().schedule.origin,'observed-manual');assert.equal(f.parent().active,false);});
test('manual move discovered ahead of deadline gets new due',async()=>{const f=fixture({time:originalTime-3*DAY});await f.run();f.event.start.dateTime=new Date(originalTime+DAY).toISOString();f.event.end.dateTime=new Date(originalTime+DAY+45*60000).toISOString();await f.run();assert.equal(f.parent().revision,2);f.time=originalTime;await f.run();assert.equal(f.sends.length,1);});
test('manual move away and back creates new episode',async()=>{const f=fixture({time:originalTime-4*DAY});await f.run();f.event.start.dateTime=new Date(originalTime+DAY).toISOString();f.event.end.dateTime=new Date(originalTime+DAY+45*60000).toISOString();await f.run();f.event=event();await f.run();assert.equal(f.parent().revision,3);});
test('partial enrolment repairs from marked Calendar event',async()=>{const f=fixture();assert.equal(f.db.data.size,0);await f.run();assert.equal(f.sends.length,1);});
test('overlapping runs share one claim',async()=>{const f=fixture();await Promise.all([f.run(),f.run()]);assert.equal(f.sends.length,1);});
test('lease prevents another claim then expires safely',async()=>{const f=fixture({time:originalTime-DAY-1});await f.run();f.time++;const a=await f.store.claim(f.key,1,f.time,'from@example.test');assert(a);assert.equal(await f.store.claim(f.key,1,f.time,'other@example.test'),null);f.time+=120001;const b=await f.store.claim(f.key,1,f.time,'changed@example.test');assert(b);assert.equal(a.idempotencyKey,b.idempotencyKey);assert.deepEqual(a.payload,b.payload);});
test('acceptance persistence interruption retries identical request',async()=>{const f=fixture();f.onSend=()=>f.db.failNextAcceptance();await f.run();assert.equal(f.episode().state,'sending');f.onSend=null;f.from='different@example.test';f.time+=30*60000;await f.run();assert.equal(f.sends.length,2);assert.deepEqual(f.sends[0],f.sends[1]);assert.equal(f.episode().state,'accepted');});
test('permanent rejection stops retries',async()=>{const f=fixture({result:{accepted:false,retryable:false}});await f.run();f.time+=30*60000;await f.run();assert.equal(f.sends.length,1);assert.equal(f.episode().state,'failed');});
test('temporary failure retains key and payload across checks',async()=>{const f=fixture({result:{accepted:false,retryable:true,ambiguous:true}});await f.run();f.time+=30*60000;f.result={accepted:true,id:'ok'};await f.run();assert.deepEqual(f.sends[0],f.sends[1]);});
test('five attempts total, not five per run',async()=>{const f=fixture({result:{accepted:false,retryable:true,ambiguous:true}});for(let i=0;i<8;i++){await f.run();f.time+=60001;}assert.equal(f.sends.length,5);assert.equal(f.episode().state,'unknown');});
test('long Retry-After never extends one-hour deadline',async()=>{const f=fixture({result:{accepted:false,retryable:true,retryAfterMs:2*HOUR}});await f.run();assert.equal(f.parent().active,false);});
test('ambiguous expired send never starts fresh after24h',async()=>{const f=fixture({result:{accepted:false,retryable:true,ambiguous:true}});await f.run();f.time+=DAY;await f.run();assert.equal(f.sends.length,1);assert.equal(f.episode().state,'unknown');});
test('stale worker finalization cannot deactivate newer revision',async()=>{const f=fixture({time:originalTime-DAY-1});await f.run();f.time++;const c=await f.store.claim(f.key,1,f.time,'from@example.test');f.event=event(originalTime+7*DAY,{reminderRevision:'new',reminderScheduledAt:new Date(f.time).toISOString()});await f.run();await f.store.finish(c,{accepted:true,id:'old-accepted'},f.time);assert.equal(f.parent().revision,2);assert.equal(f.parent().active,true);assert.equal(f.episode(1).state,'accepted');});
test('stale observation cannot overwrite newer revision',async()=>{const f=fixture({time:originalTime-3*DAY});await f.run();const old=f.parent();const moved=nextSchedule(old,event(originalTime+DAY,{reminderRevision:'new'}),f.time);await f.store.reconcile(f.key,moved,1);assert.equal(await f.store.reconcile(f.key,old.schedule,1),null);});
for(const [value,label]of [['2026-12-09T09:30:00Z','09:30 am'],['2026-07-01T08:30:00Z','09:30 am'],['2026-07-01T12:15:00Z','13:15'],['2026-12-09T12:00:00Z','12:00']])test(`UK display ${value}`,()=>assert(display(value).includes(label)));
test('24 elapsed hours across DST, independent of local clock day',()=>{const e=event(Date.parse('2027-03-28T10:00:00Z'),{reminderScheduledAt:'2027-03-26T10:00:00Z'});const s=nextSchedule(null,e,Date.parse('2027-03-27T10:00:00Z'));assert.equal(s.dueAt,Date.parse('2027-03-27T10:00:00Z'));assert.equal(Date.parse(s.startISO)-s.dueAt,DAY);});
for(const status of [400,401,403,422,429,500,503])test(`Resend HTTP ${status}`,async()=>{const send=resendAdapter('fake',async()=>({ok:false,status,headers:new Headers(),json:async()=>({})}));const r=await send({},'key');assert.equal(r.retryable,status===429||status>=500);});
test('provider timeout is ambiguous',async()=>{const send=resendAdapter('fake',async()=>{throw Error('mock timeout');});assert.deepEqual(await send({},'key'),{accepted:false,retryable:true,ambiguous:true});});
test('provider acceptance distinguished from delivery',async()=>{let sent;const send=resendAdapter('fake',async(u,o)=>{sent=o;return {ok:true,status:200,headers:new Headers(),json:async()=>({id:'queued'})};});assert.deepEqual(await send({text:'same'},'stable'),{accepted:true,id:'queued'});assert.equal(sent.headers['Idempotency-Key'],'stable');});
test('Calendar scan paginates and uses explicit marker',async()=>{const calls=[];const c=calendarAdapter({events:{list:async q=>{calls.push(q);return {data:{items:[event()],nextPageToken:calls.length===1?'next':undefined}};}}},'calendar');assert.equal((await c.discover(originalTime-DAY)).length,2);assert.deepEqual(calls[0].privateExtendedProperty,['trimziReminder=v1']);assert.equal(calls[1].pageToken,'next');});
for(const code of [404,410,503])test(`Calendar error ${code}`,async()=>{const c=calendarAdapter({events:{get:async()=>{throw {response:{status:code}};}}},'calendar');if(code===503)await assert.rejects(c.get('x'));else assert.equal(await c.get('x'),null);});

function scheduledFixture({enabled=false,pending=false}={}) {
 const f=fixture();let handler,settings,initializations=0,jwtScopes;
 if(pending)f.db.data.set('rescheduleOperations/uncertain',{state:'prepared',eventId:'test-event'});
 const values={REMINDERS_ENABLED:enabled,REMINDER_CALENDAR_ID:'calendar',REMINDER_FROM:'bookings@example.test',REMINDER_GOOGLE_CREDENTIALS:JSON.stringify({client_email:'fake@example.test',private_key:'fake'}),RESEND_API_KEY:'fake'};
 const param=(name,opts)=>({value:()=>values[name]??opts?.default});
 const client={events:{list:async()=>({data:{items:[structuredClone(f.event)]}}),get:async()=>({data:structuredClone(f.event)})}};
 const stubs={'firebase-functions/v2/scheduler':{onSchedule:(options,fn)=>{settings=options;handler=fn;return fn;}},'firebase-functions/params':{defineBoolean:param,defineString:param,defineSecret:param},'firebase-admin/app':{getApps:()=>[],initializeApp:()=>{initializations++;return{};}},'firebase-admin/firestore':{getFirestore:()=>f.db},googleapis:{google:{auth:{JWT:class{constructor(opts){jwtScopes=opts.scopes;}}},calendar:()=>client}},'./monitoring':require('../monitoring'),'./store':require('../store'),'./engine':require('../engine'),'./adapters':{calendarAdapter,resendAdapter:()=>async(payload,key)=>{f.sends.push({payload,key});return{accepted:true,id:'queued'};}}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[f.time]));}static now(){return f.time;}}
 const context={exports:{},require:name=>{assert(name in stubs,'Unexpected module '+name);return stubs[name];},console:{log(){},error(){}},Date:Clock,Set};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../index.js'),'utf8'),context);
 return {f,run:()=>handler(),settings,get initialized(){return initializations;},get scopes(){return jwtScopes;}};
}
test('scheduled entry is every30minutes UTC, disabled before access',async()=>{const s=scheduledFixture();assert.equal(s.settings.schedule,'*/30 * * * *');assert.equal(s.settings.timeZone,'UTC');assert.equal(s.settings.retryCount,0);await s.run();assert.equal(s.initialized,0);assert.equal(s.f.sends.length,0);assert.equal(s.f.db.data.size,0);});
test('scheduled entry uses read-only Calendar and independent ledger',async()=>{const s=scheduledFixture({enabled:true});await s.run();assert.equal(s.f.sends.length,1);assert.equal(s.scopes[0],'https://www.googleapis.com/auth/calendar.readonly');assert([...s.f.db.data.keys()].every(p=>p.startsWith('appointmentReminders/')));});
test('unresolved app move defers scheduled dispatch',async()=>{const s=scheduledFixture({enabled:true,pending:true});await s.run();assert.equal(s.f.sends.length,0);});
test('accepted but persistence lost expires as unknown, never non-delivery',async()=>{const f=fixture();f.onSend=()=>f.db.failNextAcceptance();await f.run();f.time+=HOUR+1;await f.run();assert.equal(f.sends.length,1);assert.equal(f.episode().state,'unknown');});
test('permanent rejection after an ambiguous attempt stays unknown',async()=>{const f=fixture({result:{accepted:false,retryable:true,ambiguous:true}});await f.run();f.time+=30*60000;f.result={accepted:false,retryable:false};await f.run();assert.equal(f.episode().state,'unknown');assert.equal(f.parent().active,false);});
