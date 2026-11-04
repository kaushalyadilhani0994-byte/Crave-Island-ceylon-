# CRAVE ISLAND CEYLON — Admin OTP access repair

Date: 2026-11-04  
Branch: `fix/admin-otp-modal-init-20261104`  
Target: `review/atomic-order-idempotency`

## Findings
1. The browser-side owner allowlist had two entries, but the connected production database confirmed that only one matches the email on the approved `auth.users` owner account. The other handover spelling does not match the live owner identity. The allowlist is now restricted to the exact email verified against the approved owner account.
2. The secure-auth module only wired the OTP buttons when `#adminAccessModal` already existed at its first initialization. If the storefront injected the modal later, the legacy controls could remain unwired and the real OTP handler would not be attached.

## Changes in this branch
- Restricted the owner allowlist to the single address verified against the approved production owner account; the address is intentionally not repeated in this note.
- Added a short-lived DOM observer to re-run the existing secure modal wiring when the storefront injects the Admin modal after page initialization.
- Updated the dynamically loaded auth script's cache-busting query in `supabase-store.js`, so a browser is less likely to keep using a cached pre-fix auth module.
- Source inspection confirmed the approved-owner profile check and OTP verification remain in place; customer Admin and owner QR tooling remain hidden; direct public passport routes and the shop QR page remain separate; and the original V18 Control Room remains the owner workspace. The customer-facing QR navigation markup still exists in `index.html`, but the auth module hides it at runtime.

## Additional delivery diagnosis
- The Vercel production alias `craveislandceylonv18supabaseintegra.vercel.app` currently resolves to the `main` deployment at commit `e10e3cd0e8c9c2ed2479bac0478983f5ae07d9ba`; it does not yet run the newer review-branch OTP implementation.
- A READY preview deployment exists for the review branch at `craveislandceylonv18supabaseintegratedbuild-mhhamludm.vercel.app` (commit `edacfdad355f1777a07225c0beca5beeed34b51e`). Its OTP flow uses the verified owner allowlist and does not create new Auth users.
- The review branch now surfaces Supabase's safe error code/message when the OTP request is rejected, rather than hiding the cause behind a generic error. This helps distinguish an Auth rate limit, SMTP/provider rejection, or network failure.
- The Supabase edge request logs checked for the last 24 hours contained no `/auth/v1/otp`, `/auth/v1/verify`, or `/auth/v1/token` requests. Therefore the recent email failure cannot be attributed to a recorded Auth rejection from those logs; a fresh controlled request is needed to capture the actual response.

## Verification and limitations
- Git diff verified: three files changed relative to the review branch — `supabase-admin-auth.js`, `supabase-store.js`, and this engineering note. The storefront change only refreshes the auth module cache key; it does not alter checkout or storefront data logic.
- The branch was not merged and no Vercel deployment was triggered.
- A live phone/email OTP test, browser UI test, and production deployment test have not been performed. These remain required before promotion.
- No Supabase schema, policies, secrets, auth settings, product/order data, or production records were changed.
