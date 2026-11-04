// Genera los iconos PNG a partir de SVG. Uso: npm run icons
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const mark = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="256" cy="256" r="150" stroke="#244C3D" stroke-width="36"/>
    <circle cx="256" cy="256" r="150" stroke="#55D6A0" stroke-width="36" stroke-dasharray="707 236" transform="rotate(135 256 256)"/>
    <path d="M182 318 L238 262 L274 292 L336 220" stroke="#55D6A0" stroke-width="32"/>
    <circle cx="336" cy="220" r="24" fill="#F5F3EE" stroke="none"/>
  </g>`
// Iconos a sangre (sin esquinas redondeadas: iOS las aplica solo)
const full = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#101820"/>${mark(scale)}</svg>`

const out = [
  ['apple-touch-icon.png', 180, 1.0],
  ['icons/icon-192.png', 192, 1.0],
  ['icons/icon-512.png', 512, 1.0],
  ['icons/maskable-512.png', 512, 0.72], // zona segura para máscaras
  ['favicon-32.png', 32, 1.0],
]
for (const [file, size, scale] of out) {
  await sharp(Buffer.from(full(scale))).resize(size, size).png().toFile(`public/${file}`)
}
console.log('Iconos generados:', out.map((o) => o[0]).join(', '))
