-- Restore only the customer-facing product fields to authenticated clients.
-- Internal inventory, expiry, manufacturing and storage fields remain RPC-only.
GRANT SELECT (id, name, category, price, currency, description, image_url, ingredients, batch_number, qr_code, is_active)
ON TABLE public.products TO authenticated;
