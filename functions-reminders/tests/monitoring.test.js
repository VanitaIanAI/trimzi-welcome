'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {monitorRun}=require('../monitoring');
function capture(){const lines=[];let clock=0;return {lines,advance:n=>clock+=n,options:{now:()=>clock,emit:s=>lines.push(JSON.parse(s))}};}
test('empty successful run is a healthy heartbeat',async()=>{const c=capture();const result={discovered:0,accepted:0,notAccepted:0,deferred:0,skipped:0};assert.equal(await monitorRun(async()=>result,c.options),result);assert.equal(c.lines[0].outcome,'healthy');});
for(const field of ['notAccepted','deferred','interrupted'])test(field+' produces degraded health',async()=>{const c=capture();await monitorRun(async()=>({[field]:field==='interrupted'?true:1}),c.options);assert.equal(c.lines[0].outcome,'degraded');assert.equal(c.lines[0].severity,'WARNING');});
test('disabled run never masquerades as heartbeat',async()=>{const c=capture();await monitorRun(async()=>({disabled:true}),c.options);assert.equal(c.lines[0].outcome,'disabled');});
test('errors preserve identity but never leak message',async()=>{const c=capture();const error=Error('private email token');await assert.rejects(monitorRun(async()=>{throw error;},c.options),e=>e===error);assert.equal(c.lines[0].outcome,'failed');assert(!JSON.stringify(c.lines).includes('private'));});
test('slow run reports elapsed time',async()=>{const c=capture();await monitorRun(async()=>{c.advance(120000);return{};},c.options);assert.equal(c.lines[0].slow,true);assert.equal(c.lines[0].durationMs,120000);});
test('only bounded fixed counts are logged',async()=>{const c=capture();await monitorRun(async()=>({accepted:1,discovered:-1,skipped:Infinity,deferred:'1',email:'private',key:'secret'}),c.options);assert.equal(c.lines[0].accepted,1);for(const key of ['discovered','skipped','deferred','email','key'])assert(!(key in c.lines[0]));});
test('logging failure does not alter work result',async()=>{const expected={accepted:1};assert.equal(await monitorRun(async()=>expected,{emit(){throw Error('logger unavailable');}}),expected);});
