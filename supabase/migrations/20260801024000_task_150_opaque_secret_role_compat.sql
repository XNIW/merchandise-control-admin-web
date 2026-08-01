-- New opaque Supabase secret keys are authorized as the built-in service_role
-- without relying on the legacy JWT request.jwt.claim.role setting. These RPCs
-- remain service-role-only through their existing EXECUTE grants; the local
-- function setting only preserves the defense-in-depth body checks across both
-- supported server-side key formats.

begin;

alter function public.task_150_win7pos_image_qa_begin_v1(
  text, text, text, text, text, text, text, uuid, uuid, text
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_provision_admit_v1(
  text, text, text, text, text
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_provision_v1(
  text, text, text, text, text, text
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_prearm_v1(
  text, text, text, text, timestamptz, text, uuid, uuid, uuid, uuid, integer
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_rotation_prepare_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer, timestamptz
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_rotation_ack_v1(
  text, text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_result_issue_v1(
  text, text, text, text, text, uuid, uuid, uuid, uuid, integer
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_cleanup_acquire_v1(
  text, text, text, text, text
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_cleanup_commit_v1(
  text, text, text, text, text, bigint
) set "request.jwt.claim.role" to 'service_role';

alter function public.task_150_win7pos_image_qa_result_v1(
  text, text, text
) set "request.jwt.claim.role" to 'service_role';

commit;
