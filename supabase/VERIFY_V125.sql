select
  to_regclass('public.price_book_items') is not null as price_book_table_ok,
  to_regprocedure('public.list_price_book_v125(uuid)') is not null as list_price_book_rpc_ok,
  to_regprocedure('public.upsert_price_book_item_v125(uuid,uuid,text,text,text,text,text,text,numeric,boolean)') is not null as upsert_price_book_rpc_ok,
  to_regprocedure('public.delete_price_book_item_v125(uuid,uuid)') is not null as delete_price_book_rpc_ok;
