# Storage and catalogue media review — 2026-10-31

## Scope

Read-only inspection of the live Supabase Storage configuration for CRAVE ISLAND CEYLON. No bucket, object, policy, product, category, or user data was changed.

## Live configuration observed

Two buckets exist:

| Bucket | Public | Size limit | MIME allowlist |
|---|---:|---:|---|
| `product-images` | false | unset | unset |
| `category-images` | false | unset | unset |

Policies on `storage.objects`:

- `Owner read brand images`: SELECT for authenticated users whose `staff_profiles` row has `role = owner` and `approved = true`, restricted to the two image buckets.
- `Owner upload brand images`: INSERT with the same approved-owner predicate and bucket restriction.
- No UPDATE or DELETE policy was found.
- No anonymous/public SELECT policy was found.

## Current application behavior

The current Owner Catalogue form asks for a publicly accessible HTTPS image URL. It does not upload image files into either Supabase bucket. The public storefront reads `products.image_url` and `categories.image_url` as URLs. Therefore, the existing private buckets are not currently a complete public product/category image delivery path.

## Security and product implications

1. Do not make either existing bucket public as a shortcut. That would change the access model for every object in that bucket.
2. Do not add broad UPDATE/DELETE policies. If upload replacement is later implemented with Storage upsert, Storage needs INSERT + SELECT + UPDATE, all constrained to approved owners and the intended bucket/path.
3. Public storefront images need a durable public delivery strategy. Options to evaluate:
   - a dedicated public-read bucket containing only deliberately published product/category images, with owner-only writes; or
   - keep private originals and publish validated derivatives to a separate public bucket after an explicit publish action.
4. Define file-size and MIME allowlists (for example, JPEG, PNG, WebP; reject SVG unless there is a deliberate sanitization pipeline) before enabling uploads.
5. Use generated object paths rather than user-supplied paths; validate content type and size; avoid trusting filename extensions.
6. Avoid storing short-lived signed URLs in `image_url` because they expire and would break customer-facing product pages.
7. The owner UI currently permits external HTTPS URLs. Keep that workflow until a secure upload/publish pipeline is implemented and tested.

## Safe next implementation sequence

1. Confirm whether product/category images should be publicly readable once published.
2. If yes, create a separate public delivery bucket for published image derivatives; do not change the existing private buckets.
3. Add bucket-specific owner INSERT/SELECT/UPDATE policies for upload staging, and owner-only DELETE only if the UI genuinely needs deletion.
4. Add server-side validation or a tightly scoped owner upload flow; enforce size/MIME limits and generated object names.
5. Add a publish step that copies validated images from private staging to the public delivery bucket, or uploads directly to the public bucket only after owner confirmation.
6. Store stable public object URLs in product/category rows.
7. Test owner upload, replacement, unauthorized access denial, public image retrieval, and image removal in an isolated test project before any production rollout.

## Status

- Inspection: complete.
- Production changes: none.
- Upload UI: not implemented.
- Public image delivery from Supabase Storage: not configured.
- Existing external HTTPS image URL workflow: retained.
- No deployment or database mutation performed.

## 2026-11-01 catalogue URL validation follow-up

The review branch now validates external category and product image URLs through the browser's native `URL` parser before saving:

- URL must parse successfully and use the `https:` protocol.
- A hostname is required.
- Embedded username/password credentials are rejected.
- The same check applies when adding or editing a collection and when adding or editing a product.
- Existing image URL fields, storage buckets, Admin layout, and save destinations are unchanged.

Static verification on the review branch:

- JavaScript source parses successfully using `new Function(source)`.
- The latest Vercel preview serves the updated `supabase-admin-products.js` source with the new validation messages (HTTP 200).
- This is not a live form/browser interaction test; no image URL was saved and no production code was changed.
