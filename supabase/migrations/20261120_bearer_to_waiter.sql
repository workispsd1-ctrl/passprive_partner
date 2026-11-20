update public.restaurant_staff set role = 'restaurant_waiter' where role = 'restaurant_bearer';
update public.users set role = 'restaurant_waiter' where role = 'restaurant_bearer';
update auth.users
  set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"Restaurant_Waiter"')
  where raw_user_meta_data->>'role' = 'Restaurant_Bearer';
