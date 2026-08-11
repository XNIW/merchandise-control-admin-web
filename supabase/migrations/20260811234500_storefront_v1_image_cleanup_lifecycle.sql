begin;

alter table public.storefront_image_publication_variants
  drop constraint if exists storefront_image_variants_verified_check;

alter table public.storefront_image_publication_variants
  add constraint storefront_image_variants_verified_check check (
    (
      publication_status in ('pending', 'failed', 'cleanup_pending', 'removed')
      and verified_bytes is null
      and verified_width is null
      and verified_height is null
      and verified_sha256 is null
      and public_url is null
      and ready_at is null
    )
    or
    (
      publication_status in ('ready', 'superseded', 'cleanup_pending', 'removed')
      and verified_bytes = expected_bytes
      and verified_width = expected_width
      and verified_height = expected_height
      and verified_sha256 = expected_sha256
      and public_url is not null
      and ready_at is not null
    )
  );

comment on constraint storefront_image_variants_verified_check
  on public.storefront_image_publication_variants is
  'Cleanup lifecycle accepts either a wholly unverified abandoned upload or a wholly verified published artifact; partial verification tuples remain forbidden.';

notify pgrst, 'reload schema';

commit;
