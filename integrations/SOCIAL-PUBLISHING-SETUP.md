# CRAVE ISLAND CEYLON — Social Publishing Plan

## Goal
Create one owner-controlled publishing workspace so the Media team can prepare one campaign and distribute it to the connected social channels without re-uploading and rewriting everything separately.

## Preserve the current app boundaries
- Keep the public storefront's existing Social and Media Clips destinations.
- Put publishing controls inside the owner-only **Media & Social** workspace.
- Do not add Admin links, account tokens, channel connection controls, drafts, or publishing APIs to public customer pages.
- Continue to use Supabase owner/staff authorization and RLS. Media staff may prepare content; only an approved owner (or explicitly granted publisher permission) may connect accounts and approve/publish.

## Publishing workspace behaviour
1. **One composer:** caption, campaign name, media upload, product/story link, hashtags, alt text, and optional schedule.
2. **Channel selection:** separate checkboxes for each connected channel; show connection state before enabling publish.
3. **Channel previews:** show character/media constraints and allow a channel-specific caption override while keeping the shared master post.
4. **Review before sending:** preview every selected destination; publishing is an explicit owner action, never an automatic side effect of saving a draft.
5. **Per-channel results:** record queued, publishing, published, failed, or needs-attention independently for each destination. A failure on one platform must not silently mark the other platforms successful.
6. **Publishing history:** searchable drafts, scheduled posts, published posts, failures, timestamps, destination post IDs, and retry controls.
7. **Asset handling:** retain the original uploaded image/video in private storage; create platform-sized derivatives only when needed. Never expose private upload paths or access tokens publicly.

## Integration approach
- Start with Meta's supported publishing APIs for a Facebook Page and its linked Instagram professional account, subject to the account's permissions and app review/configuration.
- Add TikTok and other networks only through their approved publishing APIs or an authorized publishing provider. Do not scrape websites, automate consumer logins, or ask the owner to paste passwords.
- A supported publishing provider such as Metricool can be used as the first cross-network route if the owner connects the brand's accounts and the provider exposes the required publishing/API access. A ChatGPT Metricool connection is useful for drafting/scheduling from ChatGPT, but it is separate from an integration inside the CRAVE website.

## Security and data model requirements
- All provider tokens and secrets stay in Supabase Edge Function secrets (server-side only), never in HTML, JavaScript bundles, database rows readable by clients, or Git.
- Keep channel account identifiers and non-secret connection metadata in owner-readable records only.
- Use private tables for channel connections, post drafts, per-channel publish jobs, and publish attempts. Enable RLS and grant access only to approved owner/publisher roles.
- Use idempotency keys for publish attempts to prevent duplicate posts after retries or network timeouts.
- Log provider response codes and safe error summaries; never log access tokens, refresh tokens, passwords, or full authorization headers.
- Re-check owner/staff authorization in every Edge Function. A hidden button is not an authorization boundary.

## Required setup before live publishing
- Owner connects the exact brand accounts through the provider's OAuth consent flow.
- Confirm which channels are required and which account/page/profile each destination maps to.
- Configure provider app/API credentials as server-side secrets.
- Confirm each platform's publishing eligibility, media rules, scopes, and any app review/approval.
- Run private/draft test posts first, then owner-approved live tests on each channel.
- Verify disconnect/revoke, token refresh, failed-post retry, duplicate prevention, and staff permissions.

## Current status
- The repository already contains an owner-facing **Media & Social** entry in the earlier Control Room source, described as product photography, clips, reels, voice stories, and social drafts. It is not evidence of live multi-platform publishing.
- No connected social accounts, provider credentials, or successful cross-platform publishing test have been verified yet.
- Do not claim one-click publishing is live until each selected channel has passed an end-to-end test.

## Metricool feasibility check (31 October 2026)

The official Metricool Help Center currently documents a publishing API:
- API access is included on **Advanced and Custom plans**, not Free or Starter.
- API authentication requires the account token in the `X-Mc-Auth` header plus the Metricool `userId` and brand `blogId`.
- Scheduled publishing uses `POST /api/v2/scheduler/posts`; media must first be normalized/hosted by Metricool and then referenced by its media ID.
- The API supports per-network provider configuration, but platform-specific publishing restrictions still apply. A successful schedule request is not proof that every selected network will auto-publish.

Implementation decision:
1. Do not build a browser-side Metricool token field. The token must only be stored as a Supabase Edge Function secret (for example `METRICOOL_API_TOKEN`); never place it in a client bundle, database client-readable row, URL, or Git.
2. Add Metricool `userId` and `blogId` as non-secret owner-only configuration after the owner confirms the correct CRAVE brand. Verify the API plan before promising in-app scheduling.
3. Build a server-side Edge Function that checks the approved owner/publisher role, validates the selected channels and media, applies an idempotency key, and sends the schedule request to Metricool. Store only safe request/result metadata and per-channel status.
4. Start with a draft-only test. Enable scheduling/publishing only after a private test confirms the intended Facebook Page and Instagram profile receive the correct media, caption, date and timezone.
5. If the current Metricool plan does not include API access, do not silently require an upgrade. Use Metricool's own app for scheduling as a temporary route, or evaluate the supported direct Meta API route separately.

## Owner-only account prerequisites

- Instagram must first be converted by its account owner to a Professional account (Business or Creator); the user must complete the Meta/Instagram login and consent screens personally. The assistant cannot safely perform those account-owner consent actions on the user's behalf.
- For the full Meta feature set, link the professional Instagram profile to the correct Facebook Page and confirm the Facebook profile used for authorization has Full Control/Admin access to that Page.
- The CRAVE owner workspace can prepare captions, media, campaign links and destination selections, but no live channel is marked connected until provider authorization and a test post are confirmed.
- Never request or store the user's Instagram/Facebook password in CRAVE or ChatGPT. Use provider OAuth screens only.

Official provider references:
- Metricool API access and plan requirements: https://help.metricool.com/api-access-export-your-metricool-data-to-other-tools-and-automate-tasks-x8ln5
- Metricool API integration guide: https://help.metricool.com/basic-guide-for-api-integration-r97af
- Metricool social account connection requirements: https://metricool.com/connect-social-networks-with-metricool/
