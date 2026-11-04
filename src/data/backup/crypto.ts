import { Decrypter, Encrypter } from 'age-encryption'

/** Cifrado de copias con contraseña (formato estándar `age`, compatible con la herramienta oficial). */
export const MIN_PASSPHRASE = 10

export async function encryptWithPassphrase(plain: string, passphrase: string): Promise<Uint8Array> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`La contraseña debe tener al menos ${MIN_PASSPHRASE} caracteres.`)
  const e = new Encrypter()
  e.setPassphrase(passphrase)
  return e.encrypt(plain)
}

export async function decryptWithPassphrase(data: Uint8Array, passphrase: string): Promise<string> {
  try {
    const d = new Decrypter()
    d.addPassphrase(passphrase)
    return await d.decrypt(data, 'text')
  } catch {
    throw new Error('Contraseña incorrecta o archivo dañado.')
  }
}

const MAGIC = new TextEncoder().encode('age-encryption.org/v1')
/** ¿Parece un archivo cifrado con age (binario)? */
export function looksEncrypted(bytes: Uint8Array): boolean {
  return MAGIC.every((b, i) => bytes[i] === b)
}
