/** Traduce errores de Supabase Auth (y de red) a mensajes claros en español. */
export function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; name?: string; message?: string; status?: number } | null
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  const map: Record<string, string> = {
    invalid_credentials: 'Correo o contraseña incorrectos.',
    email_not_confirmed: 'Aún no has confirmado tu correo. Revisa tu bandeja de entrada.',
    user_already_exists: 'Ya existe una cuenta con ese correo.',
    email_exists: 'Ya existe una cuenta con ese correo.',
    weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
    signup_disabled: 'El registro de nuevas cuentas está desactivado en este proyecto.',
    email_address_invalid: 'Ese correo no es válido.',
    validation_failed: 'Revisa el correo y la contraseña.',
    over_request_rate_limit: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos.',
  }
  if (map[code]) return map[code]
  if (e?.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(msg)) {
    return 'Sin conexión con el servidor. Comprueba tu Internet; tus datos locales no se ven afectados.'
  }
  if (/invalid login credentials/i.test(msg)) return map.invalid_credentials!
  if (/user already registered/i.test(msg)) return map.user_already_exists!
  if (e?.status === 429) return map.over_request_rate_limit!
  return 'No se pudo completar la operación. Inténtalo de nuevo.'
}
