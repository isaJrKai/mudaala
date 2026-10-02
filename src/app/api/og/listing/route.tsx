// The neutral OG share card — what a listing's link preview shows when the
// seller has not uploaded a real photo yet.
//
// PLACEHOLDER RULE: every photo in the app today is a temporary placeholder
// until real shops upload real ones. Seed photos never ship as a share image
// (the ad page filters them), and an ad with no photo at all must not go
// out with a broken or empty preview either. This endpoint draws the honest
// stand-in instead: plain cream background (the app's own warm off-white),
// the lowercase "mudaala" wordmark, and the listing's category name — the
// same three facts the in-app neutral tile shows. No stock, no AI images,
// no illustrations, and never a seller photo that is not really there.
//
// Deliberately minimal input: the only parameter is the category slug, and
// only allowlisted category keys are ever rendered — unknown or junk input
// gets the generic wordmark-only card. There is no free-text surface here
// for anyone to spray into a share image, and the response is identical for
// every listing in a category, so it caches immutably (only ~13 variants
// exist: the 12 categories plus the generic card).
import { ImageResponse } from 'next/og'
import { CATEGORY_KEYS, categoryLabel } from '@/lib/constants'

// Standard Open Graph dimensions — WhatsApp, X, Facebook and Telegram all
// crop around 1.91:1.
const WIDTH = 1200
const HEIGHT = 630

// The app's own light-mode palette (globals.css --background/--primary),
// flattened to hex so the card matches the app it advertises.
const CREAM = '#f9f7f4'
const CREAM_EDGE = '#e8e3d9'
const GREEN = '#205335'
const MUTED = '#6b675e'

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get('category') ?? ''
  const isKnownCategory = CATEGORY_KEYS.includes(category)

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: CREAM,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: WIDTH - 64,
            height: HEIGHT - 64,
            border: `2px solid ${CREAM_EDGE}`,
            borderRadius: 24,
          }}
        >
          {/* The wordmark, exactly as the app writes it: the lowercase
              brand moment in the dark Mudaala green. */}
          <div
            style={{
              display: 'flex',
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: -3,
              color: GREEN,
            }}
          >
            mudaala
          </div>
          <div style={{ display: 'flex', width: 64, height: 5, borderRadius: 3, marginTop: 28, backgroundColor: GREEN }} />
          {isKnownCategory ? (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 40,
                color: MUTED,
              }}
            >
              {categoryLabel(category)}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  )

  // Same-origin asset rebuilt only when the cache is cold: the bytes are a
  // pure function of the (allowlisted) category, so browsers and crawlers
  // can keep them forever.
  return new Response(image.body, {
    headers: {
      'content-type': image.headers.get('content-type') ?? 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
