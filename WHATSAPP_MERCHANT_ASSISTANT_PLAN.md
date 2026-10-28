# Mudaala WhatsApp Merchant Assistant — Technical Plan

Status: discovery complete enough to plan; implementation blocked on source/database schema reconciliation and Meta credentials.

## Product goal

Make WhatsApp the merchant's everyday control centre for Mudaala without replacing the marketplace or creating a second catalogue. One shared Mudaala WhatsApp Business number serves many merchants. Each sender must be securely linked to their own Mudaala account/shop.

## Repository findings

Canonical production repository: `isaJrKai/mudaala`, default branch `main`.

Existing code paths to reuse:
- `src/app/api/listings/route.ts`: authenticated listing creation; validates listing fields, phone numbers, country/location, prohibited items, rate limits, expiry, and saved-search notifications.
- `src/app/api/listings/[id]/route.ts`: listing owner checks and edits/status transitions.
- `src/app/api/upload/route.ts`: authenticated photo upload; size/type checks, image re-encoding through Sharp, per-user/IP rate limits, and returns the stored public URL.
- `src/lib/storage.ts`: `PhotoStorage` abstraction. Development uses local disk; production can use an S3-compatible bucket such as Supabase Storage or Cloudflare R2.
- `src/lib/auth.ts`: existing session/user lookup. WhatsApp webhook requests cannot use browser sessions directly; they need their own verified webhook boundary and must resolve a linked merchant identity server-side.
- `prisma/schema.prisma`: existing `User.phone` is unique and normalized E.164; `BusinessProfile.userId` uniquely ties a shop to a user; `Listing.userId` ties listings to their owner. `Listing.viewCount` and `ShopFollow` exist in this repository schema.

No existing WhatsApp webhook/integration was found by repository code search.

## Critical discovery blocker: source/database drift

The connected Supabase project `Mudaala` (region `eu-west-2`, active/healthy) has migrations dated through 2026-10-27 and tables not represented in the checked-in Prisma schema/baseline migration. The live database includes `ShopDailyAnalytics`, `ListingDailyAnalytics`, `BusinessProduct`, `Sale`, `SaleItem`, `StockMovement`, `ProductCollection`, `ProductCollectionItem`, `ShowroomItem`, `CategoryInterest`, `Feedback`, and `PolicyViolation`. The checked-in Prisma schema and baseline migration do not include all of these structures. Live columns also extend beyond some checked-in models.

Do not run `prisma db push`, apply schema-changing migrations, or deploy new code that relies on the extra tables until the repository, deployed app revision, and migration history are reconciled. This is a safety gate, not a reason to modify or reset production data. First recover the authoritative Prisma schema and migrations for the currently deployed application, then compare schema/migration status and run a non-destructive diff.

## Proposed architecture

1. **Meta WhatsApp Cloud API** receives merchant messages/media via HTTPS webhook and sends replies. Use Meta's test number/app first; production credentials are not required to write a provider-neutral service layer.
2. **Webhook boundary** verifies Meta's GET verification token and POST request signature using the app secret; validates payload shape; acknowledges quickly; rejects unverified requests. Never trust a shop ID sent in the message.
3. **Merchant channel link** explicitly links a WhatsApp sender to a Mudaala user. Do not assume a phone number in a profile proves control. Use an expiring one-time link code generated after sign-in to Mudaala, then require the user to send/confirm it from WhatsApp. Store the normalized WhatsApp sender and user ID with timestamps/revocation state. One sender maps to one account unless a deliberate multi-user policy is designed.
4. **Idempotent message processing** records Meta message IDs so webhook retries cannot create duplicate listings or uploads. Use a small persistent conversation/draft state for multi-step product intake.
5. **Product intake** receives photo or photo+caption; fetches media from Meta using a server-side access token; validates file size/type; sends the bytes through the existing image-processing/storage service (extract a shared server-side function from the current upload route rather than calling its browser-session endpoint from the webhook); collects missing title/price/category/location/contact details; previews the listing; publishes only after merchant confirmation.
6. **Canonical listing creation** calls shared listing-domain validation/business logic extracted from the existing API route, or a server-side service with equivalent validation. Do not duplicate prohibited-item checks, expiry rules, ownership checks, photo sanitization, or notification behavior. Do not invoke a local HTTP route with fake session credentials.
7. **Analytics** use existing engagement tracking as the source of truth. The live database has daily shop/listing analytics tables; repository source/schema does not currently consistently expose them. Reconcile this drift first, then use existing metrics for merchant summaries. Never fabricate visitor identities; report aggregate visits/views/contact clicks/follows only where accurately recorded.
8. **Menu and actions**: Add product; My products (view/edit/archive); Shop performance; Customer activity; My shop link; Growth suggestions. Build interactive WhatsApp list/reply-button menus where supported, with text commands as fallback.
9. **Nudges** come after event tracking is verified. Make them opt-in, frequency-capped, deduplicated, actionable, and sent only when WhatsApp policy/template rules allow. Avoid outbound notification costs during the initial inbound-led pilot.
10. **AI provider** is an adapter, not a dependency of core workflow. Start with Gemini free-tier eligibility for optional photo understanding/draft copy; keep the flow functional without AI. AI must never invent price, stock, quantity, or other factual fields. Merchant confirmation is required before publishing.

## Minimal first release

- Meta test number and webhook verification/signature checks.
- Explicit merchant WhatsApp linking flow.
- One inbound text/photo path, message deduplication, and safe media download.
- Draft product conversation: photo -> ask for price/name/category/location as needed -> preview -> confirm.
- Reuse existing image pipeline and listing creation rules.
- Reply with the published Mudaala listing URL.
- Tests for signature failures, unlinked sender, cross-shop isolation, duplicate webhook delivery, media validation, invalid/missing fields, prohibited listings, and successful publish.
- No proactive nudges or paid features in release one.

## Secrets/configuration (server-side only)

Expected names to decide/implement after the repo reconciliation:
- `WHATSAPP_VERIFY_TOKEN` (random secret for webhook GET verification)
- `WHATSAPP_APP_SECRET` (verify inbound request signature)
- `WHATSAPP_ACCESS_TOKEN` (Meta test token initially; production token later)
- `WHATSAPP_PHONE_NUMBER_ID`
- `GEMINI_API_KEY` (optional; never expose to browser or log)
- Existing database and storage secrets remain in their current hosting environment.

Never commit credentials to GitHub, never place provider secrets in `NEXT_PUBLIC_*`, and never use production credentials in local tests.

## Rollout and proof gates

1. Reconcile schema/revision drift; no production DDL in this phase.
2. Add the provider-neutral module and tests on a feature branch.
3. Configure Meta test app/webhook and Gemini key in a non-production environment.
4. Test against a dedicated test merchant/shop and test number only.
5. Verify a photo is stored once, a listing is created once, and the listing belongs only to the linked user.
6. Run typecheck/lint/test/build and review the PR.
7. Merge/deploy only after green CI and explicit staging/live verification. Do not claim production availability until the webhook has been exercised end-to-end.

## Current decision

Proceed with a single shared Mudaala merchant assistant, separate module, existing Mudaala backend/catalogue, photo-first plus caption intake, and merchant confirmation before publishing. Keep analytics and nudges grounded in measured events. Reconcile database drift before code that depends on live analytics tables.
