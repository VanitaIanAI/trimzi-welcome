'use strict';
// Fixed fields only: no customer identifiers, provider responses or secrets.
async function monitorRun(task, {emit=line=>console.log(line), now=Date.now}={}) {
  const started=now();
  const write=(outcome,counts={})=>{
    const durationMs=Math.max(0,now()-started);
    const record={component:'trimzi-reminders',event:'run',outcome,
      severity:outcome==='failed'?'ERROR':outcome==='degraded'?'WARNING':'INFO',
      durationMs,slow:durationMs>=120000};
    for(const name of ['discovered','accepted','notAccepted','deferred','skipped']) {
      const n=counts[name];
      if(Number.isSafeInteger(n)&&n>=0)record[name]=n;
    }
    record.interrupted=counts.interrupted===true;
    // Monitoring must not turn an accepted send into a function failure.
    try {emit(JSON.stringify(record));}catch {}
  };
  try {
    const result=await task();
    write(result?.disabled?'disabled':result?.notAccepted>0||result?.deferred>0||result?.interrupted?'degraded':'healthy',result);
    return result;
  } catch(error) {write('failed');throw error;}
}
module.exports={monitorRun};
