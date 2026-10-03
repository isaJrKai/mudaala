/**
 * One-off: generate the Owino second-hand shop photo for the Uganda-only seed.
 * Run: node scripts/generate-owino-shop.mjs
 */
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'public', 'uploads', 'seed', 'shop-owino.png')

async function main() {
  const zai = await ZAI.create()
  const response = await zai.images.generations.create({
    prompt:
      'Second-hand clothes market stall in an East African market, stacked compressed clothing bales and hanging garments on rails, wooden frame, natural daylight, photorealistic, honest documentary photography, high quality, no text, no watermark, no people faces',
    size: '1024x1024',
  })
  const b64 = response.data[0]?.base64
  if (!b64) throw new Error('no image returned')
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'))
  console.log('written', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
