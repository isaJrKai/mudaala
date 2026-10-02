// One-off CJS generator (kept runnable per script-persistence rule): require() is the
// correct syntax here since package.json has no "type":"module". Not app code.
/* eslint-disable @typescript-eslint/no-require-imports */
// Assembles the final report docx: cover (R1) + front matter (TOC, Roman) + body (Arabic).
const K = require("./report-kit.js");
const D = K.D;
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, SectionType, TableOfContents, PageBreak, LevelFormat, fs,
  h1, h2, body, bodyRuns, r, numbered, tableCaption, dataTable, F,
} = K;

const OUT = "/home/z/my-project/download/Mudaala-API-Security-Test-Coverage-Report.docx";
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: F })] })] });
}
function docHeader() {
  return new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Mudaala API Security and Test Coverage Report", size: 18, color: "808080", font: F })] })] });
}

// ── Front matter: TOC ──
const frontMatter = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 200, after: 240 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: F, color: "000000" })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({ text: "Note: right-click the TOC and select \"Update Field\" to refresh page numbers after editing.", italics: true, size: 18, color: "888888", font: F })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Body content ──
const bodyChildren = [];

// 1. Executive summary
bodyChildren.push(h1("1. Executive summary"));
bodyChildren.push(body("Mudaala is now a five-task product: public ad pages with search-engine metadata and sharing, report-and-moderation tooling with auto-hide at three distinct reporters, password reset by SMS code, the legal and phase-one security package, and real hosting on PostgreSQL with swappable photo storage. A final placeholder-rule pass flags every seeded shop, listing and photo so the demo content can be removed in one step before launch. All of it lives on the starter-launch branch at commit e7fbac2, and the integration suite that pins this behaviour runs 389 assertions green against PostgreSQL, with clean TypeScript and ESLint passes."));
bodyChildren.push(body("This report is the final deliverable of the task package: a route-by-route security and test-coverage audit. Every one of the 33 route files (41 exported handlers) plus the sitemap is listed with its authentication requirement, ownership check, rate limit, input validation, the exact test names that cover it, and its remaining risks. The audit was performed by reading each route against the actual source, so every claim carries a file-and-line citation; the risk register in chapter 6 collects the findings with severities and concrete mitigations."));
bodyChildren.push(body("Three findings deserve attention before launch. First and most important (P1): guest reporter identity and every per-IP limit derive from the client-supplied x-forwarded-for header, so the app must sit behind an edge that overwrites that header - the bundled Caddyfile already does - otherwise one actor can fabricate the three distinct reports needed to auto-hide any listing. Second (P2): the rate limiter lives in process memory, which is correct for a single instance but silently multiplies every cap the moment the app scales horizontally. Third (P2): password-reset guessing is bounded per live code, but the endpoint itself is unthrottled once no code exists. None of these block a small single-instance launch; all of them are documented with mitigations in chapter 6, and the launch checklist in chapter 7 sequences the remaining owner actions - legal text, support inbox, SMS credentials, seed removal, and the production environment variables."));

// 2. Scope
bodyChildren.push(h1("2. Scope and how to read this report"));
bodyChildren.push(body("The audit covers every route file under src/app/api at commit e7fbac2 (33 files, 41 exported handlers) plus the dynamic sitemap route, the shared libraries those routes depend on (auth, api helpers, admin, rate limiting, validation, reports, storage, geo, shop projections), the cross-cutting proxy layer, and the security headers in next.config. The integration suite in scripts/test-api.ts is the reference for behavioural claims: 389 assertions across 17 numbered sections, run against PostgreSQL on the restored preview runtime; its section map is reproduced in Appendix A."));
bodyChildren.push(body("Reading conventions are simple. Authentication is described as Public (no session needed), Session (requireUser), Admin (requireAdmin, gated by the ADMIN_PHONES allowlist), or by the presenting credential itself (logout takes any valid token; the sweep takes the cron secret; reset takes the code). Ownership entries describe how the route confines writes and reads to their owner; the recurring phrase uniform 404 means a foreign resource and a missing resource are indistinguishable by design. Rate limit cells quote caps and windows; a dash means no limiter applies, which is always called out in the notes when it matters. Validation cells summarise the rulebook applied at that route, with chapter 3.6 carrying the shared rules. Test names are quoted exactly as they appear in the suite, so they can be grepped."));
bodyChildren.push(body("Severity labels in chapter 6 follow a plain scheme. P1 means exploit-controllable behaviour worth fixing before launch. P2 means a real weakness with a bounded blast radius or an environmental precondition, acceptable for launch with an owner decision. P3 means hygiene, performance or future-proofing. Entries marked Info record deliberate postures that were verified and need no action."));

// 3. Cross-cutting controls
bodyChildren.push(h1("3. Cross-cutting controls"));
bodyChildren.push(body("This chapter describes the controls that apply across routes before the matrix in chapter 4 drills into individual endpoints. Where a control has an owner file, the citation names it."));

bodyChildren.push(h2("3.1 Authentication and sessions"));
bodyChildren.push(body("Sessions are opaque 32-byte random tokens stored server-side in the Session table with a 30-day expiry, delivered in an httpOnly cookie named mudaala_session; SameSite is Lax on localhost and None with Secure on public hosts so the preview iframe keeps working. A Bearer channel exists but is opt-in: bearerAuthEnabled() in src/lib/env-flags.ts reads ALLOW_BEARER_AUTH with the legacy AUTH_BEARER_FALLBACK alias, and the header is only consulted when the flag is on. Passwords are hashed with scrypt using a per-user salt and compared with timingSafeEqual. Two guard functions centralise enforcement: requireUser throws a 401 for anonymous callers, and requireAdmin additionally checks the session phone against ADMIN_PHONES with any dial format, failing closed when the variable is empty. Registration is also the terms gate: it refuses requests without acceptTerms and stamps termsAcceptedAt with TERMS_VERSION, currently 2026-10-02, so a future version bump can force re-confirmation."));

bodyChildren.push(h2("3.2 Rate limits"));
bodyChildren.push(body("src/lib/rate-limit.ts implements an in-memory sliding window of timestamps per key; hit() records and decides, clear() resets a bucket (used to clear login failures on success). Windows and caps are constants with env overrides so the test suite can exercise ceilings without waiting. Table 1 lists every named limit, its default, and where it is wired; Table cells quote the in-file defaults, and the sandbox .env only overrides them as documented headroom."));
bodyChildren.push(tableCaption("Rate limits wired in src/lib/rate-limit.ts"));
bodyChildren.push(dataTable(
  ["Limit", "Key scope", "Default cap", "Env override", "Notes"],
  [24, 14, 16, 24, 22],
  D.rateLimits,
  { size: 18, zebra: true, cellOpts: (ri, ci) => (ci === 0 ? { bold: true } : {}) }
));
bodyChildren.push(body("Beyond the limiter, several business quotas bound abuse without it: saved searches cap at 20 per user; reports dedupe to one OPEN report per reporter per target; the refresh cooldown allows one refresh per listing per day; uploads are capped at 8 MB per file; and reset codes die after five wrong submissions or ten minutes. " + D.quotaNotes[1] + " " + D.quotaNotes[2], { spacing: { before: 120 } }));

bodyChildren.push(h2("3.3 CSRF and origin checks"));
bodyChildren.push(body("src/proxy.ts runs on /api/*, /l/* and /s/*. Any non-GET, non-HEAD, non-OPTIONS API request that carries an Origin header must match the forwarded host, or it is answered 403 at the door - including requests that present a Bearer token, which closes the header loophole where cookie checks would be bypassed. Origin-less server-to-server clients, which is what the test suite simulates, pass through unchanged. Fielded JSON endpoints carry a second implicit layer: application/json is not a CORS-safelisted content type, so classic cross-site form posts cannot reach them. The body-less POST endpoints (logout, home/visit, refresh, saved-search check, mark-read) are the ones the origin check exists to protect, and the cross-site logout test in section 15 pins the behaviour with a stolen cookie."));

bodyChildren.push(h2("3.4 Security headers"));
bodyChildren.push(body("next.config.ts applies headers to every path: a Content-Security-Policy with default-src 'self', image sources self/data/blob/https, object-src 'none', base-uri 'self' and form-action 'self'; Strict-Transport-Security for two years with subdomains; X-Content-Type-Options nosniff; Referrer-Policy strict-origin-when-cross-origin; and a Permissions-Policy that disables camera, microphone and payment. The script-src directive still needs 'unsafe-inline' and 'unsafe-eval' for the Next.js bootstrap and dev HMR, which is the documented future step of a nonce-based CSP (risk R5). frame-ancestors is env-tunable through FRAME_ANCESTORS: it defaults to 'self', the sandbox sets the studio parents so the preview iframe renders, and production must set 'none'; X-Frame-Options mirrors the self and none cases and is omitted when a custom list is configured, because that header cannot express a list."));

bodyChildren.push(h2("3.5 Environment validation"));
bodyChildren.push(body("src/instrumentation.ts runs src/lib/env.ts at boot. In development it logs warnings; in production it refuses to start unless DATABASE_URL, a public origin (NEXT_PUBLIC_APP_URL or APP_ORIGIN), CRON_SECRET, an encryption key (SETTINGS_ENCRYPTION_KEY or the SETTINGS_ENC_KEY alias) and ADMIN_PHONES are all present, each with a named error message. Bearer authentication enabled in production is a loud warning rather than a hard stop (risk notes in chapter 6 flag this deliberately permissive posture). Fail-fast boot means a misconfigured deploy fails at start-up instead of at first request."));

bodyChildren.push(h2("3.6 Validation rulebook"));
bodyChildren.push(body("src/lib/validation.ts is the single rulebook. Phones are Uganda-only and normalised to E.164 (+256 followed by 7 or 3 and eight digits), with multi-format candidates used for lookups so 07XX, 2567XX and +2567XX forms all resolve. Passwords are 8 to 100 characters and pass a rulebook shared by registration and reset: a blocklist of twelve common passwords and a rejection of any password that contains the account's own phone number in any dial form. Listing rules cover title (4-120), description (20-2000), price (0 to 100,000,000 with at most two decimals), quantity bounds, a maximum of four photos each at most 500 characters restricted to /uploads/ or http(s) URLs, plus cross-field refinements: an offer needs a price or negotiable, a price needs a unit, and compareAtPrice must exceed price. The PATCH path re-validates against the merged record so partial updates cannot smuggle in invalid combinations. The status machine allows only the transitions in ALLOWED_STATUS_TRANSITIONS, and HIDDEN has an empty list: a hidden listing cannot be re-activated by its owner, only by an admin. Reports validate targetType, one of five reasons and details of at most 500 characters. The prohibited-items word filter (weapons, drugs, stolen-goods wording, government property, counterfeit and similar) runs at publish and again at every edit."));

bodyChildren.push(h2("3.7 Logging hygiene and PII"));
bodyChildren.push(body("The standing rule for this project is that phone numbers, verification codes and tokens never reach logs, and the audit found the codebase honouring it: the SMS failure path in forgot-password logs a delivery failure with no phone and no code, reset codes exist only as hashes, and no route logs session tokens. Two minor exceptions are tracked as risks: the development ConsoleProvider prints the full phone and code to the console gated on NODE_ENV (R11), and the generic API error handler logs raw error objects that in principle can embed query parameters (R14). dev.log captures request paths only."));

bodyChildren.push(h2("3.8 Seed data and the placeholder rule"));
bodyChildren.push(body("Every seeded user, listing and shop carries an isSeed flag, and the demo photo fixtures live in public/uploads/seed. The flag is enforced at the surfaces that matter: the sitemap includes only listings with isSeed false, ad pages filter seed photo paths out of galleries, Product JSON-LD and OG/Twitter images, and the storage migration script skips seed files entirely. scripts/remove-seed-data.ts supports a dry-run by default, a --mark mode that flagged the legacy demo content, and --yes which deletes seed rows and fixtures in one step and verifies zero traces - it is a launch step, not a development step, because the preview keeps its demo shops until then. Section 17 of the suite pins the exclusions and the dry-run safety."));

// 4. Route matrix
bodyChildren.push(h1("4. API route matrix"));
bodyChildren.push(body("This chapter is the core deliverable: every handler with its controls. Tables 2 through 8 group the routes by subsystem; within a cell a dash means the control does not apply, and '-' plus an explicit note means its absence is deliberate and worth knowing. The ownership phrase uniform 404 refers to the shared helper getOwnedListingOr404 and its per-route equivalents (lib/listings.ts:315-323), which answer foreign ids exactly like missing ones. Cell text is deliberately terse; the prose under each table explains what the grouping proves about the subsystem."));
for (const g of D.matrixGroups) {
  bodyChildren.push(h2(g.title));
  bodyChildren.push(body(g.intro));
  bodyChildren.push(tableCaption(g.title.replace(/^4\.\d+ /, "") + " - controls per handler"));
  bodyChildren.push(dataTable(
    ["Route and methods", "Auth", "Ownership", "Rate limit", "Validation", "Notes / risks"],
    [19, 11, 14, 12, 20, 24],
    g.rows,
    { size: 16, zebra: true, cellOpts: (ri, ci) => (ci === 0 ? { mono: true } : {}) }
  ));
}

// 5. Test coverage map
bodyChildren.push(h1("5. Test coverage map"));
bodyChildren.push(body("The suite is hermetic: every run registers run-tagged accounts from salted per-request IPs so per-IP budgets behave like a crowd of devices, fixtures carry RUN_TAG names to survive re-runs, and cleanup archives the fixtures it created so price-trends medians are not poisoned. It targets a live dev server over real HTTP, which is why the assertions double as the integration contract for this report. Table 9 maps each behavioural area to the exact assertion names; the full 17-section structure with line references is in Appendix A."));
bodyChildren.push(body("Two structural choices matter when reading it. First, failure-path coverage is systematic: every privileged route has an unauthenticated-401 assertion, every id-taking route has a foreign-user-404 assertion, and every rate limit has a flood test that walks the counter to the ceiling and proves the friendly 429. Second, the security behaviours added by the later tasks each carry dedicated proofs: auto-hide at three distinct reporters with the hidden ad vanishing from browse, sitemap and public API while the owner retains an appeal path; the reset code's kill, expiry and single-use semantics with full session revocation; the CSRF origin check with a stolen cookie; and the EXIF strip proven with a GPS-tagged upload."));
bodyChildren.push(tableCaption("Behaviour areas to exact test names (scripts/test-api.ts)"));
bodyChildren.push(dataTable(
  ["Area", "Representative exact assertions", "Sections"],
  [20, 68, 12],
  D.testMap,
  { size: 16, zebra: true }
));

// 6. Risks
bodyChildren.push(h1("6. Remaining risks and open items"));
bodyChildren.push(body("Table 10 is the consolidated register from the audit. Each row names the finding, the code evidence, and a concrete mitigation; severities follow the scheme in chapter 2. The single P1 is environmental rather than code: the per-IP machinery is only as trustworthy as the edge that normalises x-forwarded-for, and the bundled Caddyfile already does that for this deployment - the risk materialises only when traffic reaches the app some other way. The P2 rows are accepted-with-decisions for a small launch: they become urgent at horizontal scale, at real SMS volume, or when an APM starts logging request bodies, and each mitigation is small."));
bodyChildren.push(tableCaption("Risk register"));
bodyChildren.push(dataTable(
  ["ID", "Sev.", "Finding", "Evidence", "Suggested mitigation"],
  [5, 7, 34, 26, 28],
  D.risks,
  { size: 16, zebra: true, cellOpts: (ri, ci) => (ci === 1 ? { bold: true } : {}) }
));
bodyChildren.push(h2("6.1 Open items owned by the project"));
bodyChildren.push(body("Beyond code risks, five items wait on the owner and are sequenced into the launch checklist. The legal pages render content/privacy.md, terms.md and safety.md verbatim, so the real text needs pasting there. The support inbox behind SUPPORT_EMAIL is still a placeholder address. Africa's Talking credentials are needed before password reset sends real SMS; until then the console provider serves development. The GitHub personal access token used for the push was shared in chat and should be regenerated once the remote state is confirmed. And the seed removal step - npx tsx scripts/remove-seed-data.ts --yes - is deliberately left for launch day so the preview keeps its demo shops until the real ones arrive."));

// 7. Launch checklist
bodyChildren.push(h1("7. Launch checklist"));
bodyChildren.push(body("The steps below order the remaining work for launch day; items 1 to 3 can be done any time, items 4 to 6 are the production cutover, and items 7 to 10 are the operational loop afterwards. Each step names the exact command or variable, so the checklist can be executed top to bottom without other documents."));
for (const step of D.launchChecklist) bodyChildren.push(numbered(step, "list-launch"));

// Appendices
bodyChildren.push(h1("Appendix A. Suite section map"));
bodyChildren.push(body("The 17-section structure of scripts/test-api.ts, with what each section proves. Line references are to the section headers in the file at commit e7fbac2."));
bodyChildren.push(tableCaption("Integration suite structure (389 assertions)"));
bodyChildren.push(dataTable(
  ["No.", "Section", "What it proves"],
  [8, 34, 58],
  D.suiteSections,
  { size: 18, zebra: true, cellOpts: (ri, ci) => (ci === 0 ? { bold: true } : {}) }
));

bodyChildren.push(h1("Appendix B. Environment variable reference"));
bodyChildren.push(body("Every environment variable and secret-bearing header this report mentions, with defaults and when each is required. The sandbox .env intentionally overrides three caps as suite headroom; production values should be the defaults unless the owner decides otherwise."));
bodyChildren.push(tableCaption("Environment variables and secret headers"));
bodyChildren.push(dataTable(
  ["Variable", "Default", "Purpose", "When required"],
  [30, 12, 38, 20],
  D.envVars,
  { size: 16, zebra: true, cellOpts: (ri, ci) => (ci === 0 ? { mono: true } : {}) }
));

// ── Document assembly: 3 sections ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: F, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: F, size: 32, bold: true, color: K.P.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: F, size: 30, bold: true, color: K.P.primary },
        paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: F, size: 28, bold: true, color: "000000" },
        paragraph: { spacing: { before: 200, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  numbering: {
    config: [{
      reference: "list-launch",
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 360 } } } }],
    }],
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer, no pageNumbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: K.buildCoverR1({
        title: "Mudaala API Security & Test Coverage Report",
        subtitle: "Every API route with its auth, ownership check, rate limit, validation, covering tests, and remaining risks",
        englishLabel: "SECURITY AUDIT",
        metaLines: [
          "Branch: starter-launch @ e7fbac2",
          "Test suite: 389/389 passing on PostgreSQL",
          "Scope: 33 route files, 41 handlers, plus /sitemap.xml",
          "Date: 3 October 2026",
        ],
        footerLeft: "Mudaala - Ugandan marketplace",
        footerRight: "Prepared for the project owner",
        palette: { bg: K.P.bg, accent: K.P.accent, cover: K.P.cover },
      }),
    },
    { // Section 2: Front matter — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: frontMatter,
    },
    { // Section 3: Body — Arabic from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE " + OUT + " (" + buf.length + " bytes)");
});
