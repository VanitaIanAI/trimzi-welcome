'use strict';
// Explicit operator command; never imported by, or run inside, the app.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const {project,metric,policies}=require('./policies.cjs');
const mode=process.argv[2]||'--inspect';
if(!['--inspect','--apply','--activate-reminders'].includes(mode))throw Error('Unknown mode');
const email=process.env.TRIMZI_ALERT_EMAIL;
if(!email)throw Error('Set TRIMZI_ALERT_EMAIL to the operator notification address');
const root=path.resolve(__dirname,'..');
const req=createRequire(path.join(root,'package.json'));
const state={checkedAt:new Date().toISOString(),project,mode,policies:[]};
async function main(){
 const {requireAuth}=req('firebase-tools/lib/requireAuth');
 const account=req('firebase-tools/lib/auth').getGlobalDefaultAccount();
 if(!account)throw Error('Existing Firebase login required; no new login is attempted');
 await requireAuth({project,nonInteractive:true,...account});
 const token=await req('firebase-tools/lib/apiv2').getAccessToken();
 const api=async(host,endpoint,method='GET',body)=>{
  const res=await fetch(`https://${host}/${endpoint}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await res.json();
  if(!res.ok)throw Error(`${method} ${endpoint}: ${res.status} ${String(data.error?.message||'API failure').slice(0,400)}`);
  return data;
 };
 const monitor='monitoring.googleapis.com',logging='logging.googleapis.com';
 const list=async(host,endpoint,field)=>{let out=[],pageToken;do{const d=await api(host,endpoint+(pageToken?'?pageToken='+encodeURIComponent(pageToken):''));out.push(...(d[field]||[]));pageToken=d.nextPageToken;}while(pageToken);return out;};
 const channels=await list(monitor,`v3/projects/${project}/notificationChannels`,'notificationChannels');
 const matches=channels.filter(c=>c.type==='email'&&c.labels?.email_address===email&&c.enabled!==false);
 if(matches.length!==1)throw Error('Expected exactly one enabled email notification channel; configure/review it first');
 const channel=matches[0];state.channel={name:channel.name,verificationStatus:channel.verificationStatus||'UNSPECIFIED'};
 const existing=await list(monitor,`v3/projects/${project}/alertPolicies`,'alertPolicies');
 const metrics=await list(logging,`v2/projects/${project}/metrics`,'metrics');
 const found=metrics.find(m=>m.name===metric.name);
 if(mode==='--apply'){
  if(found&&JSON.stringify(found.filter)!==JSON.stringify(metric.filter))throw Error('Existing heartbeat metric differs; review before changing');
  if(!found)await api(logging,`v2/projects/${project}/metrics`,'POST',metric);
 }
 state.metricExists=!!found||mode==='--apply';
 if(mode==='--activate-reminders'){
  // Guard against activating absence alerts before any real enabled healthy run.
  const start=new Date(Date.now()-75*60000).toISOString();
  const logs=await api(logging,'v2/entries:list','POST',{resourceNames:[`projects/${project}`],filter:metric.filter+` timestamp>="${start}"`,pageSize:1,orderBy:'timestamp desc'});
  if(!logs.entries?.length)throw Error('No enabled healthy run in past 75 minutes; reminders must be deployed and verified first');
 }
 for(const desired of policies(channel.name,{activateReminders:mode==='--activate-reminders'})){
  const same=existing.filter(p=>p.userLabels?.managed_by==='trimzi-alerts'&&p.userLabels?.alert_id===desired.userLabels.alert_id);
  if(same.length>1)throw Error('Duplicate managed policies require review');
  let current=same[0];
  if(mode==='--apply'&&!current)current=await api(monitor,`v3/projects/${project}/alertPolicies`,'POST',desired);
  else if(mode==='--apply'&&current){
   // Re-applying setup must never silently disable previously activated monitoring.
   state.policies.push({id:desired.userLabels.alert_id,name:current.name,enabled:current.enabled,existing:true});continue;
  } else if(mode==='--activate-reminders'&&desired.userLabels.alert_id.startsWith('reminder-')){
   if(!current)throw Error('Run --apply before activation');
   current=await api(monitor,`v3/${current.name}?updateMask=enabled`,'PATCH',{name:current.name,enabled:true});
  }
  state.policies.push({id:desired.userLabels.alert_id,name:current?.name||null,enabled:current?.enabled??false});
 }
}
main().catch(error=>{state.error=error.message;process.exitCode=1;}).finally(()=>{
 fs.writeFileSync('/tmp/trimzi-alert-state.json',JSON.stringify(state,null,2));
 console.log(JSON.stringify(state));
});
