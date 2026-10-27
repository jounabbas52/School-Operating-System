# Probes

SQL that drives the migrations' new functions and asserts what they should do,
meant to be appended to a dry run:

```
npm run db:dry-run supabase/migrations/031_fee_ledger.sql \
                   supabase/migrations/038_fee_vouchers.sql \
                   supabase/migrations/039_fee_schedule.sql \
                   supabase/probes/fee_vouchers_probe.sql \
                   supabase/probes/fee_schedule_probe.sql
```

Every file runs in ONE transaction that is rolled back, so a probe sees the
migration's schema and leaves nothing behind.

Each probe sets `request.jwt.claims` before it starts. That is what makes
`auth.uid()` answer, and so `current_school_id()` and `has_permission()`
behave as they will for a real signed-in person -- the only way to find out
whether a `SECURITY DEFINER` function works before shipping it. The subject is
a school administrator's id; change it to test a narrower account.

A probe fails by raising, which aborts the run and prints the reason. So a
clean run means every assertion held.

A probe is only worth having if it can fail. `fee_vouchers_probe.sql` step 8
was written against a real bug -- a split naming a challan that was not the
student's consumed the money and allocated nothing -- and reports
`2000 was reported allocated to a challan that does not exist` if that
regression ever returns.
