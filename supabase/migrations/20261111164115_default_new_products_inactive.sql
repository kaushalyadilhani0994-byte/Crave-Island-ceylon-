-- New catalogue records must remain hidden until the approved owner explicitly activates them.
-- The owner product/passport RPC already inserts new products with is_active=false;
-- this database default adds defense in depth for any future trusted insert path.
ALTER TABLE public.products
  ALTER COLUMN is_active SET DEFAULT false;
