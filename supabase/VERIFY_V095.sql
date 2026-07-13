select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='team_invitations' and column_name='activation_token_hash') as token_column_ok,
  to_regprocedure('public.complete_team_invitation(text,text)') is not null as activation_rpc_ok;
