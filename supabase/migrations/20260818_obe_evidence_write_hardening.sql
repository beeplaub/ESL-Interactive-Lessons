-- OBE evidence is written by trusted server actions only.
-- Learners keep read access to their own evidence; direct browser writes are revoked
-- so submitted scores cannot be forged by modifying a client request.

drop policy if exists "Users insert own assessment attempts" on public.assessment_attempts;
drop policy if exists "Users insert own assessment responses" on public.assessment_responses;

revoke insert, update, delete on public.assessment_attempts, public.assessment_responses from authenticated;

