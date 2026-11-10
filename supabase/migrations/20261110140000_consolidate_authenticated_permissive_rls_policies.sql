-- Consolidate authenticated permissive policies without changing access semantics.
-- PostgreSQL ORs permissive policies; expressing each table/action as one policy
-- reduces repeated policy evaluation while preserving owner, team and customer scopes.

-- Categories
DROP POLICY IF EXISTS "Approved owner delete categories" ON public.categories;
DROP POLICY IF EXISTS "Team permitted delete categories" ON public.categories;
CREATE POLICY "Authenticated permitted delete categories" ON public.categories
  FOR DELETE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('catalogue','delete'));

DROP POLICY IF EXISTS "Approved owner insert categories" ON public.categories;
DROP POLICY IF EXISTS "Team permitted create categories" ON public.categories;
CREATE POLICY "Authenticated permitted insert categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('catalogue','create'));

DROP POLICY IF EXISTS "Authenticated read permitted categories" ON public.categories;
DROP POLICY IF EXISTS "Team permitted read categories" ON public.categories;
CREATE POLICY "Authenticated permitted read categories" ON public.categories
  FOR SELECT TO authenticated
  USING (is_active = true OR private.is_approved_owner() OR private.has_staff_permission('catalogue','read'));

DROP POLICY IF EXISTS "Approved owner update categories" ON public.categories;
DROP POLICY IF EXISTS "Team permitted update categories" ON public.categories;
CREATE POLICY "Authenticated permitted update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('catalogue','update'))
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('catalogue','update'));

-- Product passports: keep anonymous access limited to published passports
-- attached to active products; consolidate only authenticated access.
DROP POLICY IF EXISTS "Anyone reads published passports for active products" ON public.product_passports;
CREATE POLICY "Anyone reads published passports for active products" ON public.product_passports
  FOR SELECT TO anon
  USING (
    published = true AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id::text = product_passports.product_id AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approved owner deletes product passports" ON public.product_passports;
DROP POLICY IF EXISTS "Team permitted delete passports" ON public.product_passports;
CREATE POLICY "Authenticated permitted delete product passports" ON public.product_passports
  FOR DELETE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('certificates','delete'));

DROP POLICY IF EXISTS "Approved owner inserts product passports" ON public.product_passports;
DROP POLICY IF EXISTS "Team permitted create passports" ON public.product_passports;
CREATE POLICY "Authenticated permitted insert product passports" ON public.product_passports
  FOR INSERT TO authenticated
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('certificates','create'));

DROP POLICY IF EXISTS "Approved owner reads all product passports" ON public.product_passports;
DROP POLICY IF EXISTS "Team permitted read passports" ON public.product_passports;
CREATE POLICY "Authenticated permitted read product passports" ON public.product_passports
  FOR SELECT TO authenticated
  USING (
    (published = true AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id::text = product_passports.product_id AND p.is_active = true
    ))
    OR private.is_approved_owner()
    OR private.has_staff_permission('catalogue','read')
    OR private.has_staff_permission('certificates','read')
  );

DROP POLICY IF EXISTS "Approved owner updates product passports" ON public.product_passports;
DROP POLICY IF EXISTS "Team permitted update passports" ON public.product_passports;
CREATE POLICY "Authenticated permitted update product passports" ON public.product_passports
  FOR UPDATE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('certificates','update'))
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('certificates','update'));

-- Products
DROP POLICY IF EXISTS "Approved owner delete products" ON public.products;
DROP POLICY IF EXISTS "Team permitted delete products" ON public.products;
CREATE POLICY "Authenticated permitted delete products" ON public.products
  FOR DELETE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('catalogue','delete'));

DROP POLICY IF EXISTS "Approved owner insert products" ON public.products;
DROP POLICY IF EXISTS "Team permitted create products" ON public.products;
CREATE POLICY "Authenticated permitted insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('catalogue','create'));

DROP POLICY IF EXISTS "Authenticated read permitted products" ON public.products;
DROP POLICY IF EXISTS "Team permitted read products" ON public.products;
CREATE POLICY "Authenticated permitted read products" ON public.products
  FOR SELECT TO authenticated
  USING (
    is_active = true OR private.is_approved_owner()
    OR private.has_staff_permission('catalogue','read')
    OR private.has_staff_permission('inventory','read')
  );

DROP POLICY IF EXISTS "Approved owner update products" ON public.products;
DROP POLICY IF EXISTS "Team permitted update products" ON public.products;
CREATE POLICY "Authenticated permitted update products" ON public.products
  FOR UPDATE TO authenticated
  USING (private.is_approved_owner() OR private.has_staff_permission('catalogue','update'))
  WITH CHECK (private.is_approved_owner() OR private.has_staff_permission('catalogue','update'));

-- Staff profiles
DROP POLICY IF EXISTS "Approved owner reads team profiles" ON public.staff_profiles;
DROP POLICY IF EXISTS "Staff read own profile" ON public.staff_profiles;
CREATE POLICY "Authenticated permitted read staff profiles" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (private.is_approved_owner() OR id = auth.uid());

-- Store order items
DROP POLICY IF EXISTS "Approved owners read all order items" ON public.store_order_items;
DROP POLICY IF EXISTS "Customers read own order items" ON public.store_order_items;
DROP POLICY IF EXISTS "Team permitted read order items" ON public.store_order_items;
CREATE POLICY "Authenticated permitted read order items" ON public.store_order_items
  FOR SELECT TO authenticated
  USING (
    private.is_approved_owner()
    OR EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.id = store_order_items.order_id AND o.customer_id = auth.uid()
    )
    OR private.has_staff_permission('orders','read')
    OR private.has_staff_permission('dispatch','read')
  );

-- Store orders
DROP POLICY IF EXISTS "Approved owners read all store orders" ON public.store_orders;
DROP POLICY IF EXISTS "Customers read own orders" ON public.store_orders;
DROP POLICY IF EXISTS "Team permitted read orders" ON public.store_orders;
CREATE POLICY "Authenticated permitted read store orders" ON public.store_orders
  FOR SELECT TO authenticated
  USING (
    private.is_approved_owner()
    OR customer_id = auth.uid()
    OR private.has_staff_permission('orders','read')
    OR private.has_staff_permission('dispatch','read')
  );
