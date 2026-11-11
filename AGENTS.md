# AGENTS.md

NEVER build outbox/texting/email notification machinery or cron/worker services. External events = Openfront Commerce webhooks (features/webhooks) only.
Never add setInterval/setTimeout loops or `instrumentation.ts` workers. Time-based state is computed on read, advanced idempotently on the request that touches it, or advanced by a staff button.
