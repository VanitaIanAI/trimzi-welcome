import { adminDb } from '@lib/firebaseAdmin';
import { operationRef } from '@lib/calendarMutation';
import { signCancelToken } from '@lib/token';
import { formatRescheduleDateTime } from '@lib/rescheduleDisplay';

export const appointmentLabel = formatRescheduleDateTime;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function notifyReschedule(id: string): Promise<boolean> {
  const ref = operationRef(id);
  let op: any;
  let previousAcceptance = false;
  try {
    op = await adminDb.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (data?.state !== 'complete') return null;
      if (data.notificationsClaimedAt) {
        previousAcceptance = data.emailAccepted === true && data.smsAccepted === true;
        return null;
      }
      // Claim before attempting either provider. Never retry an uncertain SMS send.
      tx.update(ref, {notificationsClaimedAt: new Date()});
      return data;
    });
  } catch { return false; }
  if (!op) return previousAcceptance;
  const oldTime = appointmentLabel(op.oldStartISO), newTime = appointmentLabel(op.newStartISO);
  const email = async () => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !process.env.CANCEL_TOKEN_SECRET) return false;
    try {
      const cancelUrl = `${process.env.APP_BASE_URL || 'https://trimzi.co.uk'}/cancel?token=${signCancelToken({eventId: op.eventId})}`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: {Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          from: process.env.RESEND_FROM, to: op.confirmationEmail,
          subject: `Your TrimZi appointment has changed — ${newTime}`,
          text: `Your appointment has been rescheduled.\nService: ${op.serviceName}\nBarber: ${op.barber}\nPreviously: ${oldTime}\nNow: ${newTime}\nAll times are UK time.\nYour service and payment arrangements are unchanged.\nManage your booking in the TrimZi app.\nCancel: ${cancelUrl}`,
          html: `<h2>Your appointment has changed</h2><p>${escapeHtml(op.serviceName)} with ${escapeHtml(op.barber)}</p><p>Previously: ${escapeHtml(oldTime)}<br><strong>Now: ${escapeHtml(newTime)}</strong></p><p>All times are UK time. Your service and payment arrangements are unchanged.</p><p>You can view your updated booking in the TrimZi app.</p><p><a href="${escapeHtml(cancelUrl)}">Cancel appointment</a></p><p>— TrimZi</p>`,
        }),
      });
      const data = await response.json().catch(() => null);
      return response.ok && typeof data?.id === 'string';
    } catch { return false; }
  };
  const sms = async () => {
    if (!process.env.CLICKSEND_USERNAME || !process.env.CLICKSEND_API_KEY || !process.env.ALERT_SMS_TO || !process.env.SMS_SENDER) return false;
    try {
      const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: {'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString('base64')}`},
        body: JSON.stringify({messages: [{source: 'trimzi-app', to: process.env.ALERT_SMS_TO, from: process.env.SMS_SENDER,
          body: `Booking rescheduled.\n${op.customerName}\n${op.serviceName}\nFrom: ${oldTime}\nTo: ${newTime}`}]}),
      });
      const data = await response.json().catch(() => null);
      const message = data?.data?.messages?.[0];
      return response.ok && data?.response_code === 'SUCCESS' && message?.status === 'SUCCESS' && Boolean(message?.message_id);
    } catch { return false; }
  };
  const [emailAccepted, smsAccepted] = await Promise.all([email(), sms()]);
  console.log('[Reschedule confirmation] Provider acceptance:', {emailAccepted, smsAccepted});
  await ref.update({emailAccepted, smsAccepted}).catch(() => {});
  return emailAccepted && smsAccepted;
}
