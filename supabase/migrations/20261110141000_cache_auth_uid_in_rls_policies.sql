-- Cache auth.uid() once per statement in policies that reference customer/staff identity.
DROP POLICY IF EXISTS "Authenticated permitted read staff profiles" ON public.staff_profiles;
CREATE POLICY "Authenticated permitted read staff profiles" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (private.is_approved_owner() OR id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Authenticated permitted read order items" ON public.store_order_items;
CREATE POLICY "Authenticated permitted read order items" ON public.store_order_items
  FOR SELECT TO authenticated
  USING (
    private.is_approved_owner()
    OR EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.id = store_order_items.order_id
        AND o.customer_id = (SELECT auth.uid())
    )
    OR private.has_staff_permission('orders','read')
    OR private.has_staff_permission('dispatch','read')
  );

DROP POLICY IF EXISTS "Authenticated permitted read store orders" ON public.store_orders;
CREATE POLICY "Authenticated permitted read store orders" ON public.store_orders
  FOR SELECT TO authenticated
  USING (
    private.is_approved_owner()
    OR customer_id = (SELECT auth.uid())
    OR private.has_staff_permission('orders','read')
    OR private.has_staff_permission('dispatch','read')
  );
