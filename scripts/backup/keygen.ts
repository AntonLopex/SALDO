/**
 * Genera el par de claves de la copia externa.
 *   npx tsx scripts/backup/keygen.ts
 * - La clave PÚBLICA ("age1…") va a GitHub (variable AGE_RECIPIENT). Cifra, no descifra.
 * - La clave PRIVADA ("AGE-SECRET-KEY-…") guárdala en tu gestor de contraseñas. SIN ella no se puede recuperar ninguna copia.
 * No escribe archivos: solo muestra las claves en pantalla.
 */
import { generateIdentity, identityToRecipient } from 'age-encryption'

const identity = await generateIdentity()
const recipient = await identityToRecipient(identity)
console.log('\nClave PÚBLICA (para GitHub → variable AGE_RECIPIENT):')
console.log(recipient)
console.log('\nClave PRIVADA (guárdala en tu gestor de contraseñas; NO la subas a GitHub ni la compartas):')
console.log(identity)
console.log('\nSi pierdes la clave privada, las copias cifradas no se pueden abrir. Nadie puede recuperarlas.\n')
