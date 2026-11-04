# SALDO en el iPhone: instalar y registrar un gasto en segundos

> **Verificado:** el manifest, los iconos y el funcionamiento sin conexión se comprueban en el navegador de escritorio. **El comportamiento en tu iPhone no se ha probado**: iOS tiene particularidades que cambian entre versiones. Sigue la guía y, si algo no coincide, dímelo con la versión de iOS.

## 1. Instalar SALDO (Safari)
1. Abre `https://antonlopex.github.io/SALDO/` en **Safari** (no vale otro navegador para instalar).
2. Botón **Compartir** (cuadrado con flecha) → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre SALDO desde el icono. Debe verse a pantalla completa, sin barra de Safari.

Qué ganas al instalarla:
- Pantalla completa y arranque rápido.
- **Mejor protección de tus datos locales:** iOS puede borrar los datos de webs que no se usan durante un tiempo, pero no los de apps instaladas en la pantalla de inicio.
- Funciona sin conexión.

**Importante:** una app instalada tiene su **propio almacenamiento**, separado del de Safari. Si ya probaste SALDO en una pestaña de Safari, esos datos **no pasan** a la app instalada. Con la cuenta y la sincronización activas, la app instalada los recupera de la nube al iniciar sesión. Si no, exporta una copia en Safari y restáurala en la app (Ajustes → Copias de seguridad).

## 2. Acceso directo al formulario de gasto
La ruta `/nuevo-gasto` muestra **solo** el formulario rápido, sin menús.

### Opción A (recomendada): un segundo icono en la pantalla de inicio
1. En Safari abre `https://antonlopex.github.io/SALDO/nuevo-gasto`.
2. **Compartir → Añadir a pantalla de inicio** y ponle el nombre «Gasto».

Así tienes un icono que abre directamente el formulario. **Compruébalo:** según la versión de iOS, un icono añadido así puede abrir siempre la página de inicio de la app en vez de `/nuevo-gasto`. Si ocurre, usa la opción B.

### Opción B: app Atajos de Apple
1. Abre **Atajos** → **+** → **Añadir acción** → **Abrir URL**.
2. URL: `https://antonlopex.github.io/SALDO/nuevo-gasto`.
3. Nómbralo «Gasto» y pulsa **Añadir a pantalla de inicio** (o agrégalo al widget de Atajos).

**Limitación de iOS:** «Abrir URL» abre la dirección en **Safari**, no en la app instalada. Para el formulario rápido funciona bien (los datos locales de Safari y los de la app instalada son distintos), pero si usas la app instalada y el atajo, tendrías **dos almacenes distintos**. Con la cuenta y la sincronización activas, ambos convergen en la nube, pero un gasto registrado en Safari sin conexión no aparecerá en la app instalada hasta sincronizar.

**Recomendación práctica:** elige **una** vía y úsala siempre (por ejemplo, solo la app instalada + la opción A), y mantén la sincronización activa.

## 3. Lo que hace `/nuevo-gasto`
- Carga sin el panel de inicio y sin la pantalla de bienvenida, aunque sea tu primera vez.
- Muestra tus categorías favoritas, la fecha de hoy y el importe listo para escribir.
- Tras guardar: confirmación y opción de deshacer, «Añadir otro» o «Abrir SALDO».
- **Teclado:** Safari solo abre el teclado automáticamente tras un toque del usuario. Si no sale al entrar, toca el importe: es la zona grande de arriba.

## 4. Sin conexión
- Con SALDO instalada, abre y registra gastos sin Internet; se guardan en el dispositivo.
- iOS **no sincroniza en segundo plano**: los gastos se envían a la nube la próxima vez que abras la app con conexión. El icono de nube de la cabecera muestra cuántos quedan pendientes.

## 5. Actualizaciones
Cuando haya versión nueva verás «Nueva versión disponible»: pulsa **Actualizar**. En Ajustes → *Buscar actualización* puedes forzar la comprobación. Si algo parece desfasado, cierra la app del todo (deslizar hacia arriba en el selector de apps) y vuelve a abrirla.

## 6. Si algo falla
| Síntoma | Qué probar |
|---|---|
| Al abrir sin conexión sale error | Abre la app una vez **con** conexión para que se guarde para uso sin conexión |
| Pierdes la sesión de la cuenta | Inicia sesión de nuevo en Ajustes → Cuenta (los datos locales no se pierden) |
| No ves los gastos hechos en otro sitio | Ajustes → Sincronización → *Sincronizar ahora* |
| Quieres empezar de cero | **No borres los datos del sitio antes de exportar una copia** (Ajustes → Copias de seguridad) |
