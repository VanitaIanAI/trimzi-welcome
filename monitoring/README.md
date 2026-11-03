# TrimZi operational alerts

These policies monitor symptoms, not dependency versions or individual exploit signatures. They do not replace dependency review or provider delivery reports.

## Configuration

- Reminder failures/degraded work: failed run, deferred work or a send not accepted. One notification at most per hour per log policy, subject to Google incident behaviour.
- Server runtime: Cloud Run memory-limit/heap failures or HTTP 504, restricted to ssrtrimzi and appointmentreminders in europe-west2.
- Slow reminders: completion after at least 120 seconds.
- Missing healthy reminder: no healthy enabled run in a 75-minute window, handling both zero counts and entirely missing series. Aggregates across revisions. Google ingestion/evaluation/notification latency is additional.
- Booking server: at least three HTTP 5xx responses in five minutes, aggregated across revisions.

The reminder's monitoring wrapper emits fixed aggregate fields only. A zero-appointment successful run is healthy; disabled, failed, deferred, rejected or interrupted runs are not. Logging failure does not change send outcomes. Reminder scheduling, retries, booking validation, existing confirmations and payment processing remain unchanged.

## Operator commands

Run from the repository using the existing authenticated Firebase CLI installation. Set TRIMZI_ALERT_EMAIL to the intended operator address in the shell; it is not a customer-mail setting and is not stored in source.

`node monitoring/configure.cjs --inspect` reads current configuration.

`node monitoring/configure.cjs --apply` creates the heartbeat counter and five policies if missing. Two existing-app health policies are enabled; three reminder policies are disabled until deployment. Existing managed policies are not overwritten or disabled. No services, permissions, secrets, Cloud Run deployments or schedules are changed. An unexpected existing metric or duplicate policy stops setup. API calls are bounded and mutation calls are not automatically retried.

After approved deployment, verify the actual deployed reminder service name, IAM/Scheduler invocation, enabled healthy structured logs (including an empty diary), metric ingestion and Resend outcomes. Then run `node monitoring/configure.cjs --activate-reminders`. Activation requires a recent healthy run, but does not by itself prove Scheduler is delivering it on time. Wait for two scheduled runs, and test notification delivery separately. Confirm notification channel verification if Google requires it.

If intentionally disabling reminders, disable their three policies too. Do not disable the booking-server health policies. If a reminder incident occurs, investigate before any manual resend; ambiguous attempts may already have been accepted by Resend.

## Remaining live verification

Confirm the custom metric and PromQL alert query return expected results in Cloud Monitoring. Use controlled synthetic monitoring entries to test the relevant policy and email delivery without creating appointments or contacting customers. Never present local tests, successful policy creation, or a saved email channel as proof that notification delivery works.

Managed policies have labels managed_by=trimzi-alerts and a stable alert_id. Setup state is written to /tmp/trimzi-alert-state.json for review. No API tokens are logged or saved by the script.

Google Cloud Monitoring/Logging pricing applies. Review the project's monitoring cost page after activation; this configuration uses one aggregate custom counter without customer labels and otherwise existing platform data.

References: https://docs.cloud.google.com/monitoring/alerts/policies-in-api ; https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts ; https://docs.cloud.google.com/logging/docs/logs-based-metrics/troubleshooting
