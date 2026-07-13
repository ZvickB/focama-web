-- Add the explicit budget-first option without changing existing saved preferences.

alter table public.user_preferences
  drop constraint if exists user_preferences_ranking_priority_check;

alter table public.user_preferences
  add constraint user_preferences_ranking_priority_check
    check (ranking_priority in ('balanced', 'price', 'lowest_price', 'brand', 'range'));
