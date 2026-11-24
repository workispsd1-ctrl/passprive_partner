drop trigger if exists till_nudge on public.payment_sessions;
create trigger till_nudge after insert or update of status on public.payment_sessions
  for each row execute function public.till_nudge();

drop trigger if exists till_nudge_printed on public.print_jobs;
create trigger till_nudge_printed after update on public.print_jobs
  for each row when (old.printed_at is distinct from new.printed_at or old.failed_at is distinct from new.failed_at)
  execute function public.till_nudge();
