-- Per-school visual identity. These fields are optional; BrenUp's default
-- design remains in place until an organization chooses to brand its space.

alter table public.organizations
  add column if not exists brand_name text,
  add column if not exists logo_url text,
  add column if not exists accent_color text;

alter table public.organizations
  drop constraint if exists organizations_accent_color_check;

alter table public.organizations
  add constraint organizations_accent_color_check
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
