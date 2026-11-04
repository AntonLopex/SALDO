import { copyFileSync } from 'node:fs'
// GitHub Pages sirve 404.html en rutas desconocidas: copiamos index.html para que /nuevo-gasto cargue la SPA.
copyFileSync('dist/index.html', 'dist/404.html')
console.log('dist/404.html creado')
