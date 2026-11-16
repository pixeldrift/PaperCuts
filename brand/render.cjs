// Rasterise the brand SVGs to PNG (needs `playwright`; run from the repo root: node brand/render.cjs)
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const jobs = [
  // [svg, png, width, background (null = transparent)]
  ['public/icons/icon.svg', 'public/icons/icon-192.png', 192, null],
  ['public/icons/icon.svg', 'public/icons/icon-512.png', 512, null],
  ['public/icons/icon-maskable.svg', 'public/icons/icon-maskable-512.png', 512, null],
  ['public/icons/apple-touch-icon.svg', 'public/icons/apple-touch-icon.png', 180, null],
  ['public/icons/icon.svg', 'public/icons/favicon-32.png', 32, null],
  ['brand/logo-stacked-dark.svg', 'brand/preview/logo-stacked-dark.png', 900, '#17181C'],
  ['brand/logo-horizontal-dark.svg', 'brand/preview/logo-horizontal-dark.png', 1100, '#17181C'],
  ['brand/logo-stacked-light.svg', 'brand/preview/logo-stacked-light.png', 900, '#FFFFFF'],
  ['brand/logo-horizontal-light.svg', 'brand/preview/logo-horizontal-light.png', 1100, '#FFFFFF'],
]

;(async () => {
  const browser = await chromium.launch()
  for (const [svg, png, width, bg] of jobs) {
    const markup = fs.readFileSync(svg, 'utf8')
    const vb = markup.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number)
    const height = Math.round((width * vb[3]) / vb[2])
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.setContent(
      `<body style="margin:0;background:${bg ?? 'transparent'}">${markup.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body>`,
    )
    fs.mkdirSync(path.dirname(png), { recursive: true })
    await page.screenshot({ path: png, omitBackground: !bg })
    await page.close()
    console.log('wrote', png, `${width}x${height}`)
  }
  await browser.close()
})()
