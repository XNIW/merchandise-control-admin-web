-- TASK-101 production-readiness hardening.
-- Keep the RLS event trigger operational while removing direct client-role
-- EXECUTE grants from its SECURITY DEFINER function.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$$;
