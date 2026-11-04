# CRAVE ISLAND CEYLON — Admin OTP access repair

Date: 2026-11-04  
Branch: `fix/admin-otp-modal-init-20261104`  
Target: `review/atomic-order-idempotency`

## Findings
1. The browser-side owner allowlist did not match the corrected owner email recorded in the project handover. The mismatch caused `sendCode()` to reject the address before calling Supabase Auth, so no OTP request could reach Supabase and no email could be sent.
2. The secure-auth module only wired the OTP buttons when `#adminAccessModal` already existed at its first initialization. If the storefront injected the modal later, the legacy controls could remain unwired and the real OTP handler would not be attached.

## Changes in this branch
- Corrected the owner allowlist to the confirmed owner-email spelling from the project handover.
- Added a short-lived DOM observer to re-run the existing secure modal wiring when the storefront injects the Admin modal after page initialization.
- Preserved the approved-owner profile check, OTP verification, RLS boundaries, hidden customer Admin navigation, hidden owner QR tooling, public shop QR route, and original V18 Control Room.

## Verification and limitations
- Git diff verified: only `supabase-admin-auth.js` changed relative to the review branch; the change is isolated to the owner auth module.
- The branch was not merged and no Vercel deployment was triggered.
- A live phone/email OTP test, browser UI test, and production deployment test have not been performed. These remain required before promotion.
- No Supabase schema, policies, secrets, auth settings, product/order data, or production records were changed.
