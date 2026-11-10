-- When inventory tracking is disabled, close any stale stock alert for that product.
-- Keep expiry alert handling unchanged.
CREATE OR REPLACE FUNCTION public.refresh_product_inventory_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_today date := (now() at time zone 'Asia/Colombo')::date;
BEGIN
  IF coalesce(NEW.track_inventory, false) THEN
    IF coalesce(NEW.stock_quantity, 0) <= 0 THEN
      INSERT INTO public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
      VALUES ('stock:' || NEW.id::text, 'out_of_stock', 'critical', 'Out of stock: ' || NEW.name,
              'Stock for ' || NEW.name || ' is zero or below. Replenish or hide this product.',
              'product', NEW.id::text, 'open', now())
      ON CONFLICT (dedupe_key) DO UPDATE SET status='open', severity='critical', title=excluded.title, message=excluded.message, updated_at=now();
    ELSIF NEW.stock_quantity <= greatest(coalesce(NEW.low_stock_threshold,5),0) THEN
      INSERT INTO public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
      VALUES ('stock:' || NEW.id::text, 'low_stock', 'warning', 'Low stock: ' || NEW.name,
              'Only ' || NEW.stock_quantity::text || ' units remain for ' || NEW.name || '. Check expected demand and replenish.',
              'product', NEW.id::text, 'open', now())
      ON CONFLICT (dedupe_key) DO UPDATE SET status='open', severity='warning', title=excluded.title, message=excluded.message, updated_at=now();
    ELSE
      UPDATE public.admin_alerts SET status='resolved', updated_at=now()
      WHERE dedupe_key='stock:' || NEW.id::text AND status <> 'resolved';
    END IF;
  ELSE
    UPDATE public.admin_alerts SET status='resolved', updated_at=now()
    WHERE dedupe_key='stock:' || NEW.id::text AND status <> 'resolved';
  END IF;

  IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date <= v_today + 30 THEN
    INSERT INTO public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
    VALUES ('expiry:' || NEW.id::text, 'expiry',
            CASE WHEN NEW.expiry_date < v_today THEN 'critical'
                 WHEN NEW.expiry_date <= v_today + 7 THEN 'critical'
                 ELSE 'warning' END,
            CASE WHEN NEW.expiry_date < v_today THEN 'Expired product: ' || NEW.name
                 ELSE 'Expiry approaching: ' || NEW.name END,
            'Recorded expiry date: ' || NEW.expiry_date::text || '. Review this batch before sale.',
            'product', NEW.id::text, 'open', now())
    ON CONFLICT (dedupe_key) DO UPDATE SET status='open', severity=excluded.severity, title=excluded.title, message=excluded.message, updated_at=now();
  ELSE
    UPDATE public.admin_alerts SET status='resolved', updated_at=now()
    WHERE dedupe_key='expiry:' || NEW.id::text AND status <> 'resolved';
  END IF;
  RETURN NEW;
END;
$function$;
