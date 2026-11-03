'use strict';
function calendarAdapter(client,id) {
  return {id,
    async discover(now) {
      let pageToken; const events=[];
      for (let page=0;page<10;page++) {
        const {data} = await client.events.list({calendarId:id,privateExtendedProperty:['trimziReminder=v1'],timeMin:new Date(now).toISOString(),showDeleted:false,singleEvents:true,maxResults:2500,pageToken}, {timeout:15000,retry:false});
        events.push(...(data.items || [])); pageToken=data.nextPageToken;
        if (!pageToken) return events;
      }
      throw Error('Calendar scan safety limit reached');
    },
    async get(eventId) {
      try { return (await client.events.get({calendarId:id,eventId},{timeout:15000,retry:false})).data; }
      catch (e) { if ([404,410].includes(Number(e.response?.status || e.code))) return null; throw e; }
    },
  };
}
function resendAdapter(apiKey,fetcher=fetch) {
  return async (payload,key) => {
    try {
      const response = await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>null);
      if (response.ok && typeof data?.id === 'string') return {accepted:true,id:data.id};
      const retryAfter=response.headers.get('retry-after');
      const seconds=Number(retryAfter);
      const retryAfterMs=retryAfter ? (Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(retryAfter)-Date.now())) : 0;
      // A success with an unreadable ID is ambiguous; retain the same payload/key on retry.
      return {accepted:false,retryable:response.ok || response.status===408 || response.status===429 || response.status>=500,ambiguous:response.ok || response.status===408 || response.status>=500,retryAfterMs:Number.isFinite(retryAfterMs)?retryAfterMs:0};
    } catch { return {accepted:false,retryable:true,ambiguous:true}; }
  };
}
module.exports={calendarAdapter,resendAdapter};
