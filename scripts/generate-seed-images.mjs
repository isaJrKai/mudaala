/**
 * Generates realistic seed photos for Duuka fixtures into public/uploads/seed/.
 * Product photos: one per seeded listing. Shop photos: one per seeded shop.
 * Run: node scripts/generate-seed-images.mjs
 */
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'public', 'uploads', 'seed')
fs.mkdirSync(OUT, { recursive: true })

const STYLE =
  'photorealistic, natural daylight, East African local market setting, honest documentary product photography, high quality, no text, no watermark'

const LISTINGS = [
  ['listing-matooke', 'Fresh green matooke banana bunches stacked at a Ugandan market stall'],
  ['listing-eggs-ug', 'Crates of fresh brown eggs stacked at an East African open market stall'],
  ['listing-copper', 'Clean copper wire scrap bundles piled at a scrap metal yard, metallic orange shine'],
  ['listing-aluminium', 'Stacked aluminium sheets and castings ready for recycling at a yard'],
  ['listing-cement', 'Stacks of 50kg cement bags inside a hardware store godown'],
  ['listing-iron-sheets', 'Corrugated painted iron roofing sheets stacked at a building materials yard'],
  ['listing-red-onions', 'Red onions overflowing from large woven sacks at a wholesale produce market'],
  ['listing-sunflower-oil', 'Golden sunflower cooking oil in 20 litre blue jerricans on a shop shelf'],
  ['listing-maize', 'Dry white maize grains with a metal scoop at a grain collection store'],
  ['listing-wheat-flour', '50kg wheat flour bags stacked on wooden pallets in a mill warehouse'],
  ['listing-eggs-ke', 'Trays of fresh eggs at a coastal Kenyan market vendor stall'],
  ['listing-oil-mombasa', 'Cooking oil jerricans stacked outside a coastal wholesale shop'],
  ['listing-clothes-bales', 'Compressed bales of second-hand clothing wrapped in plastic at a clothing market'],
  ['listing-milk', 'Traditional aluminium milk cans filled with fresh raw milk at a dairy collection point'],
  ['listing-charcoal', 'Open sacks of hardwood charcoal stacked at a market vendor'],
  ['listing-firewood', 'Bundles of split dry firewood stacked neatly outdoors'],
]

const SHOPS = [
  ['shop-nakato', 'East African open-air fresh produce shop stall with bananas, tomatoes and onions, wooden table, colorful'],
  ['shop-kampalamart', 'Scrap metal dealership yard with sorted piles of copper and aluminium, corrugated iron fence'],
  ['shop-jinja-hardware', 'Hardware shop in a Ugandan town with shelves of hand tools, cement bags and paint tins'],
  ['shop-dodoma-agri', 'Agricultural supplies shop front in central Tanzania with grain sacks and seed packets'],
  ['shop-jomo-scrap', 'Scrap trading shop in Nairobi with a platform weighing scale and sorted metal piles'],
  ['shop-pendo-flour', 'Flour mill warehouse with pallets of flour bags and milling machinery'],
  ['shop-mama-amina', 'Small shop counter with cooking oil jerricans and flour packets, coastal Kenya'],
  ['shop-kisumu-fresh', 'Fresh produce stall near Lake Victoria with tomatoes, onions and greens in baskets'],
]

async function gen(zai, name, prompt) {
  const out = path.join(OUT, `${name}.png`)
  if (fs.existsSync(out)) {
    console.log(`skip ${name} (exists)`)
    return true
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await zai.images.generations.create({ prompt: `${prompt}, ${STYLE}`, size: '1024x1024' })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error('empty response')
      fs.writeFileSync(out, Buffer.from(b64, 'base64'))
      console.log(`ok ${name}`)
      return true
    } catch (err) {
      console.error(`attempt ${attempt} failed for ${name}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  return false
}

const zai = await ZAI.create()

// Concurrency pool — each generation is a network call, so a small pool cuts
// wall time ~5x without hammering the API.
const JOBS = [...LISTINGS, ...SHOPS]
const CONCURRENCY = 5
let cursor = 0
let failed = 0

async function worker() {
  while (cursor < JOBS.length) {
    const [name, prompt] = JOBS[cursor++]
    const ok = await gen(zai, name, prompt)
    if (!ok) failed++
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`DONE failed=${failed}`)
process.exit(failed > 0 ? 1 : 0)
