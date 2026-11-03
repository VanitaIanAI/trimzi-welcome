# TrimZi reminder worker — NOT ACTIVATED

The code is separate from the Next.js app and the default `firebase.json`. A normal existing app deployment does not deploy this codebase. Do not enable the Scheduler API, deploy this package or send test emails without Ian's explicit approval. No real email is needed for `npm test`.

## Behaviour

- UTC `*/30 * * * *` schedule. Aim: 24 elapsed hours ahead; normal delivery 23.5–24 hours ahead. Maximum lateness is one hour from the original due time, not another hour after the normal poll.
- Strict eligibility: booking/move made more than 24 hours ahead. Exactly24h is excluded.
- New marked guest and signed-in Calendar bookings only. Client booking documents are never the recipient source. No automatic enrolment of legacy/Treatwell events.
- Calendar marker is part of event creation, so the worker can reconstruct an absent ledger without adding a fallible service call to booking. The app reschedule patch changes time and reminder revision together. Recovery rereads that same event; unresolved prepared operations defer reminders.
- Reminder worker never edits Calendar events or working booking documents. It writes only top-level `appointmentReminders/{hash}` and its `episodes/{revision}` children. Existing deployed default-deny rules protect these from client access; do not replace rules. Firestore queries are single-field and rely on default automatic indexing.
- Registered user preference: `profiles/{uid}.notif.remindersEmail`; missing means enabled, false suppresses, failed reads defer. Guests do not require a profile. Marketing settings are unrelated.
- Every observed start/end change starts a new episode. A genuine app revision uses its server action timestamp. A manual move is dated at observation, conservatively skipping it if first observed within24h. Polling cannot reconstruct unseen moves or move-away-and-back between observations, especially during outages. Generic Calendar.updated is deliberately ignored.
- One immutable provider payload/key per episode, transactional claim, two-minute lease. At most five attempts total. Retry occurs on later 30-minute checks, only inside the original one-hour deadline, respecting Retry-After. The cap is not a target: normally only two or three ticks fit the window. Scheduler automatic retries are off. Permanent rejects stop immediately.
- A provider timeout is ambiguous; bounded retries retain exactly the same key/body. The ledger survives Resend's24-hour key retention. Expired/ambiguous sends never restart under a fresh key. Accepted means provider accepted, not delivered.
- A changed/cancelled event is checked before sending; no diary lock is held during provider calls. A manual cancellation/move after the last read and before email acceptance can still race with the send. No cross-service transaction can eliminate that race.
- Email contains service, UK date/time (am before noon,24h afterward), salon address and Ian's text/WhatsApp contact. Registered users also get a Bookings link. No expired confirmation cancellation token is reused. No new cancellation link is added in this first version.
- Safety caps: complete Calendar scan up to10pages, ledger up to1000active records, prepared operations up to1000; fail/defer above limits. A run stops starting further work after200seconds (function timeout240seconds). Logs contain counts only, never recipients, bodies or credentials.

## Local validation

From repository root:

```
node --test functions-reminders/tests/*.test.js
node tests/reschedule.cjs
npm run build
```

Tests use mocked Calendar, Firestore, clock, profile and Resend. They do not load `.env.local` and do not send real requests. Worker `index.js` is an uninvoked scheduled export, never a development timer.

## Later deployment checklist (approval required)

Dependency review2November2026: this isolated package pins firebase-admin14.5.0, firebase-functions7.4.0 and googleapis189.0.0 (registry versions verified during implementation). The working app's packages are unchanged. After compatible automatic fixes, production audit still reports six moderate advisories in the SDK's glob/minimatch dependency branches, with zero high/critical findings. No forced upgrades/overrides were applied. The worker does not pass customer data as filesystem paths or glob patterns; this is not a claim that the upstream findings are fixed. Recheck these findings and assess any upstream fix before live activation. See the saved implementation review for exact advisory details.

1. Reconfirm checkpoint, test results, current Cloud rules, indexes and Calendar sharing. Keep existing app deployment separate. Deploy the app's enrolment metadata first; legacy records stay unmarked. Enrolment is inert without the worker.
2. Install this package's locked dependencies, using Node22. Enable Cloud Scheduler API only at approved deployment. Other core APIs/Secret Manager and paid billing were verified2November2026; recheck if delayed.
3. Explicitly select/review runtime service identity. Firestore Admin uses that identity's IAM, not browser rules; it needs access to reminder records, profiles and read-only reschedule operations. Scope all permissions to TrimZi. Do not grant new broad access automatically.
4. Securely provision `RESEND_API_KEY` and `REMINDER_GOOGLE_CREDENTIALS` secrets. The latter is a JSON service credential with `client_email` and `private_key`; never commit it. Reuse only an approved Calendar identity or approve a dedicated one with read access to the SAME booking calendar. The code requests only Calendar.readonly. The new function does not inherit the app's environment file.
5. Set non-secret parameters: `REMINDER_CALENDAR_ID` exact calendar ID, `REMINDER_FROM=bookings@trimzi.co.uk`, `REMINDERS_ENABLED=false`. Keep false for the initial deployment. SDK secret bindings still require their values to exist even while sending is disabled.
6. Review the CLI deployment plan before executing. Deploy only this explicitly isolated codebase with the separate configuration, e.g. `npx --no-install firebase deploy --config firebase.reminders.json --only functions:trimzi-reminders --project trimzi`. Do not accept deletion of unrelated functions. Default app `firebase.json` stays unchanged.
7. Verify deployed function runtime, secret bindings, private scheduler invocation and30-minute UTC schedule. Verify a disabled invocation produces no sends or ledger writes. A controlled real-data/email test requires separate Ian approval; no silent adjustment of real appointment times to trigger it.
8. Enable only after controlled acceptance checks; record first scheduler run/outcome. Resend quota is shared by confirmations/reschedule emails/reminders. Rate limits/quota failures defer/expire within the bounded deadline, not indefinitely. No custom dashboard is added.

## Disable / rollback

Set `REMINDERS_ENABLED=false` and redeploy only the reminder function, or pause its scheduler job for an immediate stop to future invocations. A currently running send may already have reached Resend. Keep the ledger; do not delete/re-enrol it to retry an uncertain email. Disable is independent of the app; reminders' failures never undo bookings. Reverting the two app metadata changes is optional because unused markers are inert. No deployment is performed by saving this README.
