-- Add columns for tracking Google Calendar sync state on each event.

alter table public.events
  add column google_sync_status text
    constraint events_google_sync_status_check
    check (google_sync_status is null or google_sync_status in ('pending', 'synced', 'failed')),
  add column google_sync_error  text,
  add column google_synced_at   timestamptz;
