/**
 * Descifra una copia externa (.age) para poder restaurarla en la app.
 *   AGE_IDENTITY="AGE-SECRET-KEY-…" npx tsx scripts/backup/decrypt.ts copia.json.age copia.json
 * o con la clave en un archivo:
 *   npx tsx scripts/backup/decrypt.ts copia.json.age copia.json --identity-file clave.txt
 * Después, en la app: Ajustes → Copias de seguridad → Restaurar una copia → elige copia.json.
 * Borra copia.json cuando termines: contiene tus datos en texto legible.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { Decrypter } from 'age-encryption'
import { validateBackup } from '../../src/data/backup/format'

const [, , input, output, flag, flagValue] = process.argv
if (!input || !output) {
  console.error('Uso: decrypt.ts <copia.json.age> <salida.json> [--identity-file <archivo>]')
  process.exit(2)
}
const identity = flag === '--identity-file' && flagValue ? (await readFile(flagValue, 'utf8')).trim() : process.env.AGE_IDENTITY?.trim()
if (!identity) {
  console.error('Falta la clave privada: variable AGE_IDENTITY o --identity-file.')
  process.exit(2)
}
try {
  const d = new Decrypter()
  d.addIdentity(identity)
  const text = await d.decrypt(new Uint8Array(await readFile(input)), 'text')
  const check = await validateBackup(JSON.parse(text))
  await writeFile(output, text, { mode: 0o600 })
  console.log(`Descifrado en ${output}. Validación: ${check.ok ? 'correcta' : 'CON PROBLEMAS: ' + check.errors.join(' | ')}`)
  if (!check.ok) process.exit(1)
} catch {
  console.error('No se pudo descifrar: clave incorrecta o archivo dañado.')
  process.exit(1)
}
