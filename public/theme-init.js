// Aplica el tema antes de pintar para evitar parpadeo. Archivo propio (no inline) para poder usar una CSP estricta.
try {
  var m = localStorage.getItem('saldo-theme') || 'auto'
  var dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#101820' : '#F5F3EE')
} catch (e) {}
