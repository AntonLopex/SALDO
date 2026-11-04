# SALDO en el iPhone: instalar y registrar un gasto o un ingreso en un toque

> **Qué está verificado y qué no.** Las direcciones y sus parámetros (`/nuevo-gasto`, `/nuevo-ingreso`, `?importe=…`) están **probadas en un navegador** con pruebas automáticas: rellenan el formulario, no guardan nada solos y funcionan sin conexión. **Lo que hace iOS con ellas (Atajos, iconos de inicio, widgets) NO se ha probado en un iPhone**: cambia entre versiones y los nombres de los menús pueden variar. Sigue la guía y, si algo no coincide, dime tu versión de iOS.

## Lo que se puede (y lo que no)
- **Widget nativo de SALDO: no.** Los widgets de Apple solo existen para apps nativas, y una PWA no lo es. Hacer una app nativa exigiría pagar la cuenta de desarrollador de Apple.
- **Lo más parecido, y gratis:** el **widget de Atajos** (sí es nativo de Apple) y/o **un icono por acción** en la pantalla de inicio. Con un toque se abre el formulario de SALDO ya preparado.

| Quiero… | Cómo | Toques hasta guardar |
|---|---|---|
| Un botón «Gasto» y otro «Ingreso» en la pantalla de inicio | [Sección 2](#2-un-icono-por-acción-gasto-e-ingreso) | icono → importe → Guardar |
| Lo mismo como **widget** (inicio, pantalla de bloqueo, Centro de control) | [Sección 3](#3-widgets-de-atajos) | widget → importe → Guardar |
| Que el atajo **me pregunte el importe** y abra el formulario ya relleno | [Sección 4](#4-recetas-de-atajos-copiar-y-pegar), recetas 3 y 4 | widget → escribir importe → Guardar |
| Un café de 1,40 € en un toque | Receta 5 | widget → Guardar |

## Regla de seguridad (importante)
Los enlaces **rellenan** el formulario pero **nunca guardan**. El último toque, **Guardar**, siempre es tuyo. Es deliberado: si un enlace pudiera guardar, cualquier mensaje o página web podría registrarte gastos falsos con solo abrirlo. Por eso no existe ningún parámetro «guardar» (si lo escribes, se ignora).

## 1. Instalar SALDO (Safari)
1. Abre `https://antonlopex.github.io/SALDO/` en **Safari** (no vale otro navegador para instalar).
2. Botón **Compartir** (cuadrado con flecha) → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre SALDO desde el icono. Debe verse a pantalla completa, sin barra de Safari.

Qué ganas al instalarla:
- Pantalla completa y arranque rápido.
- **Mejor protección de tus datos locales:** iOS puede borrar los datos de webs que no se usan durante un tiempo, pero no los de apps instaladas en la pantalla de inicio.
- Funciona sin conexión.

## 2. Un icono por acción: «Gasto» e «Ingreso»

SALDO tiene **dos direcciones propias**, una por acción:

| Icono | Dirección |
|---|---|
| Gasto | `https://antonlopex.github.io/SALDO/nuevo-gasto` |
| Ingreso | `https://antonlopex.github.io/SALDO/nuevo-ingreso` |

Usan **rutas distintas** (no un parámetro) a propósito, porque iOS conserva mejor la ruta que el texto que va tras el `?` cuando guardas un icono.

### Opción A (recomendada, la más fiable): crear el icono desde Atajos
Un atajo con «Abrir URL» y **Añadir a pantalla de inicio**. No depende de cómo iOS trate el manifest de la web.
1. App **Atajos** → **+** → **Añadir acción** → **Abrir URL** → pega la dirección de la tabla.
2. Toca el nombre del atajo (arriba) → **Renombrar** («Gasto» o «Ingreso») y, si quieres, elige icono y color.
3. En ese mismo menú elige **Añadir a pantalla de inicio**.
4. Repite para el otro.

### Opción B: directamente desde Safari
1. Abre la dirección de la tabla en **Safari**.
2. **Compartir → Añadir a pantalla de inicio**, ponle el nombre «Gasto» / «Ingreso».
3. **Compruébalo:** según la versión de iOS, un icono añadido así puede abrir **siempre la página de inicio de SALDO** en vez de la dirección que guardaste. Si pasa, usa la opción A.

## 3. Widgets de Atajos
Con los atajos ya creados (sección 2 o 4), muéstralos como widget. Los nombres de los menús pueden variar según tu iOS:
- **Pantalla de inicio:** mantén pulsado un hueco → **+** → **Atajos** → elige el tamaño → **Añadir widget** → tócalo y elige el atajo. Los tamaños mayores muestran varios atajos a la vez: «Gasto» e «Ingreso» juntos.
- **Pantalla de bloqueo:** mantén pulsada la pantalla de bloqueo → **Personalizar** → **Añadir widgets** → **Atajos**.
- **Centro de control** (iOS recientes): edita los controles y añade un control de **Atajos**.

## 4. Recetas de atajos (copiar y pegar)
En todas: **Atajos → + → Añadir acción** y renombra el atajo. Sustituye `[Entrada]` insertando la variable **«Entrada proporcionada»** (toca en la URL y elígela de la lista de variables).

**Receta 1 · Gasto** — acción *Abrir URL*:
```
https://antonlopex.github.io/SALDO/nuevo-gasto
```

**Receta 2 · Ingreso** — acción *Abrir URL*:
```
https://antonlopex.github.io/SALDO/nuevo-ingreso
```

**Receta 3 · Gasto: me pregunta el importe**
1. Acción **Pedir entrada** → tipo **Número**, pregunta «¿Cuánto?».
2. Acción **Abrir URL**:
```
https://antonlopex.github.io/SALDO/nuevo-gasto?importe=[Entrada]
```
Se abre el formulario con el importe ya escrito. Eliges la categoría (o la favorita) y pulsas Guardar.

**Receta 4 · Ingreso: me pregunta el importe**
Igual que la 3 pero con:
```
https://antonlopex.github.io/SALDO/nuevo-ingreso?importe=[Entrada]
```

**Receta 5 · Café de 1,40 € en un toque**
Una sola acción *Abrir URL*:
```
https://antonlopex.github.io/SALDO/nuevo-gasto?importe=1,40&categoria=cafe
```
Se abre con 1,40 € y Café ya elegidos: solo pulsas Guardar.

**Receta 6 · Gasto fijo con importe variable** (por ejemplo «comida»)
1. **Pedir entrada** (Número).
2. **Abrir URL**:
```
https://antonlopex.github.io/SALDO/nuevo-gasto?importe=[Entrada]&categoria=Comida%20en%20restaurante
```

### Parámetros disponibles
| Parámetro | Valores | Notas |
|---|---|---|
| `tipo` | `gasto`, `ingreso` | `/nuevo-ingreso` ya abre en ingreso |
| `importe` | `3,50`, `3.50`, `1.391,50` | Positivo y como máximo 999.999,99 €. Si no es válido, se ignora |
| `categoria` | `cafe`, `Café`, `Ocio`, `Viajes/Transporte` | Sin distinguir mayúsculas ni tildes. Los espacios van como `%20`. Solo gastos |
| `nota` | texto | Máximo 120 caracteres. Se muestra siempre como texto |

**Cómo se interpreta la categoría:**
- Si el nombre coincide con una categoría principal («Regalos», «Transporte», «Ocio»), se elige esa.
- Si es ambiguo entre subcategorías («Actividades» está en Ocio **y** en Viajes), **no se adivina**: escribe `Viajes/Actividades`.
- Lo que no existe se ignora, y el formulario se abre normal.

## 5. Importante: Safari y la app instalada no comparten datos
Un atajo con «Abrir URL» abre la dirección en **Safari**, no en la app instalada. Y Safari y la app instalada tienen **almacenamientos separados**:
- Con tu **cuenta y la sincronización activas**, ambos acaban viendo lo mismo en la nube.
- Pero un gasto guardado en Safari **sin conexión** no aparece en la app instalada hasta que se sincronice.

**Recomendación práctica:** elige **una** vía y úsala siempre, y mantén la sincronización activa.

## 6. Qué hacen estas direcciones
- Cargan sin el panel de inicio y sin la pantalla de bienvenida, aunque sea tu primera vez.
- Muestran tus categorías favoritas y la fecha de hoy. Si no trae importe, el campo del importe ya está enfocado.
- Tras guardar: confirmación y opción de deshacer, «Añadir otro» o «Abrir SALDO». «Añadir otro» deja el formulario limpio (los parámetros no se vuelven a aplicar).
- **Teclado:** Safari solo abre el teclado automáticamente tras un toque del usuario. Si no sale al entrar, toca el importe: es la zona grande de arriba.
- **Android y escritorio:** al instalar la app, una pulsación larga en el icono ofrece «Nuevo gasto» y «Nuevo ingreso». iOS ignora esos accesos directos del manifest.

## 7. Sin conexión
- Con SALDO instalada, abre y registra sin Internet; se guarda en el dispositivo.
- iOS **no sincroniza en segundo plano**: se envía a la nube la próxima vez que abras la app con conexión. El icono de nube de la cabecera muestra cuántos quedan pendientes.

## 8. Actualizaciones
Cuando haya versión nueva verás «Nueva versión disponible»: pulsa **Actualizar**. En Ajustes → *Buscar actualización* puedes forzar la comprobación. Si algo parece desfasado, cierra la app del todo (deslizar hacia arriba en el selector de apps) y vuelve a abrirla.

## 9. Si algo falla
| Síntoma | Qué probar |
|---|---|
| El icono abre la página de inicio en vez del formulario | Usa la **opción A** de la sección 2 (crear el icono desde Atajos) |
| El atajo abre el formulario vacío | Comprueba la URL (sin espacios ni saltos de línea) y que la variable «Entrada proporcionada» esté dentro de la URL |
| La categoría no se selecciona | El nombre no existe o es ambiguo: usa `Padre/Sub` (p. ej. `Viajes/Transporte`) y `%20` en vez de espacios |
| Al abrir sin conexión sale error | Abre la app una vez **con** conexión para que se guarde para uso sin conexión |
| No ves los gastos hechos en otro sitio | Ajustes → Sincronización → *Sincronizar ahora* |
| Quieres empezar de cero | **No borres los datos del sitio antes de exportar una copia** (Ajustes → Copias de seguridad) |
