'use strict';
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineBoolean,defineString,defineSecret}=require('firebase-functions/params');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {google}=require('googleapis');
const {createStore}=require('./store');
const {calendarAdapter,resendAdapter}=require('./adapters');
const {runReminders}=require('./engine');
const {monitorRun}=require('./monitoring');

const enabled=defineBoolean('REMINDERS_ENABLED',{default:false});
const calendarId=defineString('REMINDER_CALENDAR_ID',{default:''});
const sender=defineString('REMINDER_FROM',{default:''});
const calendarCredentials=defineSecret('REMINDER_GOOGLE_CREDENTIALS');
const resendKey=defineSecret('RESEND_API_KEY');

exports.appointmentReminders=onSchedule({schedule:'*/30 * * * *',timeZone:'UTC',region:'europe-west2',serviceAccount:'trimzi-reminder-worker@trimzi.iam.gserviceaccount.com',memory:'512MiB',timeoutSeconds:240,maxInstances:1,concurrency:1,retryCount:0,secrets:[calendarCredentials,resendKey]},async()=>monitorRun(async()=>{
  if (!enabled.value()) { return {disabled:true}; }
  try {
  if (!calendarId.value() || !sender.value() || !resendKey.value()) throw Error('Reminder configuration missing');
  const credentials=JSON.parse(calendarCredentials.value());
  if (!credentials.client_email || !credentials.private_key) throw Error('Reminder Calendar credentials missing');
  const auth=new google.auth.JWT({email:credentials.client_email,key:credentials.private_key.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/calendar.readonly']});
  const db=getFirestore(getApps()[0] || initializeApp());
  const started=Date.now();
    // Do not dispatch against an app move whose durable outcome still needs recovery.
    const calendar=calendarAdapter(google.calendar({version:'v3',auth}),calendarId.value());
    const readEvent=calendar.get;
    calendar.get=async eventId=>{
      const pending=await db.collection('rescheduleOperations').where('state','==','prepared').limit(1001).get();
      if (pending.docs.length>1000 || pending.docs.some(d=>d.data().eventId===eventId)) throw Error('App move awaiting recovery');
      return readEvent(eventId);
    };
    let interrupted=false;
    const counts=await runReminders({enabled:true,store:createStore(db),calendar,now:()=>Date.now(),
      profile:async uid=>{const p=await db.collection('profiles').doc(uid).get();return p.data()?.notif?.remindersEmail !== false;},
      send:resendAdapter(resendKey.value()),from:sender.value(),canContinue:()=>{const ok=Date.now()-started<200000;if(!ok)interrupted=true;return ok;}});
    return {...counts,interrupted};
  } catch { console.error('[Reminders] Run deferred; no provider/customer data logged.'); throw Error('Reminder run did not complete'); }
}));
