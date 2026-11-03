'use strict';
const {keyFor, inspect, nextSchedule} = require('./policy');

async function runReminders({enabled,store,calendar,profile,send,from,now=Date.now,log=()=>{},canContinue=()=>true}) {
  if (!enabled) return {disabled:true};
  const counts = {discovered:0,accepted:0,notAccepted:0,deferred:0,skipped:0};
  const events = await calendar.discover(now()); // Complete bounded scan, including future moves; no customer data in logs.
  for (const event of events) {
    if (!canContinue()) break;
    try {
      const key = keyFor(calendar.id,event.id);
      const previous = await store.get(key);
      const schedule = nextSchedule(previous,event,now());
      if (schedule) { await store.reconcile(key,schedule,previous?.revision || 0); counts.discovered++; }
    } catch { counts.deferred++; }
  }
  for (const record of await store.active()) {
    if (!canContinue()) break;
    if (now() < record.schedule.dueAt) continue;
    try {
      // Calendar, not a user-editable saved booking copy, is authoritative.
      const event = await calendar.get(record.schedule.eventId);
      if (!event || !inspect(event,now())) { await store.close(record.key,record.revision,'skipped'); counts.skipped++; continue; }
      const schedule = nextSchedule(record,event,now());
      const current = await store.reconcile(record.key,schedule,record.revision);
      if (!current || current.revision !== record.revision) continue;
      if (now() > schedule.deadline) { await store.close(record.key,record.revision,'expired'); continue; }
      const claim = await store.claim(record.key,record.revision,now(),from);
      if (!claim) continue;
      // No transaction/diary lock remains held during provider access.
      const finalEvent = await calendar.get(schedule.eventId);
      const checked = inspect(finalEvent,now());
      if (!checked || checked.startISO !== schedule.startISO || checked.endISO !== schedule.endISO || checked.appRevision !== schedule.appRevision || checked.email !== schedule.email || checked.uid !== schedule.uid) {
        await store.close(record.key,record.revision,'superseded'); continue;
      }
      if (schedule.uid && !(await profile(schedule.uid))) { await store.close(record.key,record.revision,'skipped'); continue; }
      if (!(await store.current(claim,now()))) continue;
      const result = await send(claim.payload,claim.idempotencyKey);
      await store.finish(claim,result,now());
      if (result.accepted) counts.accepted++;
      else counts.notAccepted++;
    } catch { counts.deferred++; } // Unknown Calendar/profile/storage results never authorise a send.
  }
  log(counts);
  return counts;
}
module.exports = {runReminders};
