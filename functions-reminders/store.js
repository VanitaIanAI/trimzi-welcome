'use strict';
const {randomUUID} = require('node:crypto');
const {message} = require('./policy');
const terminal = new Set(['accepted','failed','expired','unknown','skipped','superseded']);

function createStore(db) {
  const parent = key => db.collection('appointmentReminders').doc(key);
  const episode = (key, rev) => parent(key).collection('episodes').doc(String(rev));
  return {
    async get(key) { return (await parent(key).get()).data() || null; },
    async active() {
      // Single-field query; no rule or composite-index deployment required.
      const snap = await db.collection('appointmentReminders').where('active','==',true).limit(1001).get();
      if (snap.docs.length > 1000) throw Error('Reminder record safety limit reached');
      return snap.docs.map(d => ({key:d.id,...d.data()}));
    },
    async reconcile(key, schedule, expectedRevision) {
      return db.runTransaction(async tx => {
        const p = (await tx.get(parent(key))).data();
        // A competing worker changed this observation. Re-read next run, never overwrite it.
        if ((p?.revision || 0) !== expectedRevision) return null;
        if (p && p.schedule.startISO === schedule.startISO && p.schedule.endISO === schedule.endISO && p.schedule.appRevision === schedule.appRevision) return {key,...p};
        const old = p ? (await tx.get(episode(key,p.revision))).data() : null;
        const revision = (p?.revision || 0) + 1;
        if (old && !terminal.has(old.state)) tx.update(episode(key,p.revision), {state:'superseded'});
        const record = {revision,schedule,active:schedule.eligible};
        tx.set(parent(key),record);
        tx.create(episode(key,revision), {state:schedule.eligible?'pending':'skipped',attempts:0,leaseUntil:0,nextAttemptAt:0,ambiguous:false});
        return {key,...record};
      });
    },
    async close(key, revision, state) {
      return db.runTransaction(async tx => {
        const p = (await tx.get(parent(key))).data();
        const e = (await tx.get(episode(key,revision))).data();
        if (!p || p.revision !== revision || !e || terminal.has(e.state)) return;
        tx.update(parent(key),{active:false});
        tx.update(episode(key,revision),{state:state === 'expired' && (e.ambiguous || e.state === 'sending') ? 'unknown' : state,leaseUntil:0});
      });
    },
    async claim(key, revision, now, from) {
      return db.runTransaction(async tx => {
        const p = (await tx.get(parent(key))).data();
        const e = (await tx.get(episode(key,revision))).data();
        if (!p || p.revision !== revision || !p.active || !e || terminal.has(e.state)) return null;
        if (now < p.schedule.dueAt || now > p.schedule.deadline || e.leaseUntil > now || e.nextAttemptAt > now || e.attempts >= 5) return null;
        const token = randomUUID();
        const payload = e.payload || message(p.schedule,from);
        const idempotencyKey = `trimzi-reminder/${key}/${revision}`;
        tx.update(episode(key,revision), {state:'sending',token,leaseUntil:now+120000,attempts:e.attempts+1,payload,idempotencyKey,ambiguous:e.ambiguous || e.state==='sending',firstAttemptAt:e.firstAttemptAt ?? now});
        return {key,revision,token,payload,idempotencyKey,schedule:p.schedule};
      });
    },
    async current(claim, now) {
      const p = (await parent(claim.key).get()).data();
      const e = (await episode(claim.key,claim.revision).get()).data();
      return !!(p?.active && p.revision === claim.revision && e?.token === claim.token && e.state === 'sending' && e.leaseUntil > now && now <= p.schedule.deadline);
    },
    async finish(claim, result, now) {
      return db.runTransaction(async tx => {
        const p = (await tx.get(parent(claim.key))).data();
        const e = (await tx.get(episode(claim.key,claim.revision))).data();
        if (!e || e.state === 'accepted') return;
        if (result.accepted) {
          // Preserve acceptance even if the appointment advanced while the provider was processing.
          tx.update(episode(claim.key,claim.revision), {state:'accepted',providerId:result.id,acceptedAt:now,leaseUntil:0});
          if (p?.revision === claim.revision) tx.update(parent(claim.key),{active:false});
          return;
        }
        if (e.token !== claim.token || terminal.has(e.state)) return;
        const ambiguous = e.ambiguous || result.ambiguous === true;
        const nextAttemptAt = now + Math.max(60000, result.retryAfterMs || 0);
        const exhausted = e.attempts >= 5 || nextAttemptAt > claim.schedule.deadline;
        const state = !result.retryable ? (ambiguous?'unknown':'failed') : exhausted ? (ambiguous?'unknown':'expired') : 'retry';
        tx.update(episode(claim.key,claim.revision),{state,ambiguous,nextAttemptAt,leaseUntil:0});
        if (state !== 'retry' && p?.revision === claim.revision) tx.update(parent(claim.key),{active:false});
      });
    },
  };
}
module.exports = {createStore};
