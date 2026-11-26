alter table public.restaurants add column if not exists menu_hash text;
create or replace function public.restaurants_set_menu_hash() returns trigger language plpgsql as $$
begin
  new.menu_hash := md5(coalesce(new.menu_json::text, ''));
  return new;
end;
$$;
drop trigger if exists restaurants_menu_hash on public.restaurants;
create trigger restaurants_menu_hash before insert or update of menu_json on public.restaurants for each row execute function public.restaurants_set_menu_hash();
update public.restaurants set menu_hash = md5(coalesce(menu_json::text, '')) where menu_hash is distinct from md5(coalesce(menu_json::text, ''));
alter function public.restaurants_set_menu_hash() set search_path = public;
