# Traspaso para la próxima sesión de Claude

Notas para retomar **finan** sin contexto previo. Antes de nada, lee `CLAUDE.md`: es la especificación viva (cómo funciona cada pantalla, cada cálculo y cada ajuste) y se actualiza en cada PR. Este archivo cuenta lo que `CLAUDE.md` no recoge: cómo trabajamos, el estado actual, cómo probar y qué queda pendiente o abierto.

## Cómo trabajamos

- **Idioma:** con el usuario, en español. La interfaz, los textos de la app, los comentarios del código y los mensajes de commit también van en español.
- **Una petición = una rama, un PR y su merge.**
  1. Se trabaja siempre en `claude/claude-md-u4yhj9`, reiniciada desde `origin/main` al empezar cada petición: `git fetch origin main && git checkout -B claude/claude-md-u4yhj9 origin/main`.
  2. Se implementa y se prueba.
  3. Se hace commit con los trailers de atribución que indique la sesión.
  4. `git push -u origin claude/claude-md-u4yhj9 -f`.
  5. Se crea el PR (cuerpo con «Qué cambia» y «Pruebas»).
  6. **Lo fusiona Claude**: el usuario lo autorizó.
- **Antes de cada PR:** `pnpm lint` y `pnpm build` en `frontend/`, prueba en el navegador con Playwright (móvil 390×844 o 402×874, como su iPhone, y PC 1280×900; a veces también 320 y 360 de ancho y el modo oscuro), y `CLAUDE.md` actualizado con lo que cambie. Si cambia la API, pruébala también con `TestClient` (casos válidos y los que deben dar 4xx).
- **Antes de fusionar:** comprueba que el despliegue de Vercel del PR acabó bien (estado del último commit del PR).
- **`CLAUDE.md` se actualiza en cada PR. Este traspaso, no:** solo cuando el usuario lo pida. Lo dijo así: «no quiero actualizar el handoff hasta que yo quiera hacerlo, o sea cuando acabe con los tokens casi de la sesión». Cuando lo pida, recoge todo lo hecho desde la última actualización.
- **Al terminar:** un resumen corto y claro en español, sin jerga técnica. Si algo no se pudo probar, se dice.
- El usuario prueba en su **iPhone 16 Pro (Safari)** sobre el despliegue de Vercel y manda capturas. Lo que en Chromium va bien puede fallar en iOS (ver «Particularidades de iOS»).

## Gustos del usuario (aprendidos por el camino)

- Minimalismo: datos discretos, sutiles y sin ruido. Estética de Trade Republic en móvil.
- Nada de textos de ejemplo (placeholders) dentro de los campos.
- Lo justo en pantalla. Ya se quitaron, a petición suya:
  - el «Disponible este mes» y el ahorro mensual;
  - la media de ahorro, la tendencia y la tasa de ahorro (del resumen de la gráfica solo queda el colchón).
- Detalles de interacción cuidados: animaciones que no se cortan, la información de un punto solo mientras se toca, sin recuadros de foco ni selección al tocar.
- Prefiere que las cuentas sean realistas aunque sean menos simples: p. ej. no invertir nunca más de lo que sobra cada mes.
- Cuando duda de un concepto financiero, pregunta. Explícalo con sus propios números antes de cambiar nada.
- Si una petición admite varias lecturas, pregúntale con opciones (marcando la recomendada) antes de hacerla. A veces responde con sus propias palabras en lugar de elegir: síguelas al pie de la letra y, si hay que interpretarlas, dile cómo lo has entendido y ofrécele la otra opción.
- Quiere ver los límites antes de equivocarse (p. ej. cuánto le queda libre al invertir) y que la app no deje hacer lo que no tiene sentido (invertir más de lo que tiene o de lo que le sobra).
- Lo que borra datos va con aviso en rojo y confirmación.
- Las inversiones van en su propia pestaña junto al Historial, no en Ajustes.

## Estado actual (lo último hecho)

Todo está fusionado en `main` y no hay trabajo a medias. Últimos PR:

| PR | Qué |
|---|---|
| #42 | Disponible este mes (después retirado en #46/#47) |
| #43 | Objetivo con fecha, línea de la meta en la gráfica, tarjeta en PC y «Así te afecta» |
| #44 | Revisión mensual (saldo real frente a previsto, «Ajustar al saldo real») |
| #45 | Colchón y tasa de ahorro en el resumen de la gráfica |
| #46 | Fuera las estadísticas salvo el colchón y fuera el disponible de la pantalla |
| #47 | Fuera el ahorro mensual del todo; modales sin scroll lateral en móvil |
| #48 | «Euros de hoy» (descontar la inflación) |
| #49 | Inversión: rentabilidad compuesta de la parte invertida |
| #50 | Ajustes en dos niveles: menú agrupado con resumen y una pantalla por ajuste |
| #51 | Inversión: nunca aportar más de lo que sobra cada mes |
| #52 | Inversión: máximo a aportar, fecha final y plan mes a mes |
| #53 | Campos de fecha en iOS sin aspecto nativo; filas de dos campos alineadas por abajo |
| #54 | Este traspaso |
| #55 | Copia de seguridad: exportar e importar en Ajustes → Datos |
| #56 | «Así te afecta» recalcula la inversión y avisa de lo que se deja de invertir; «Este mes no» en el servidor; lo que sobra cada mes, de los flujos |
| #57 | Historial de revisiones mensuales (en el modal de la revisión y en Ajustes → Revisiones) |
| #58 | «Con 100 €/mes más» cuenta lo que rendirían esos euros si completan aportaciones a la inversión |
| #59 | Editar un flujo a 0 €: «Así te afecta» muestra cómo queda sin él y guardar lo elimina (con confirmación) |
| #60 | Formulario de la inversión: muestra lo libre y no deja pasarse (lo invertido, del patrimonio de hoy; la aportación, de lo que sobra el mes que viene) |
| #61 | Varias inversiones (tabla `investments`), en una pestaña «Inversiones» junto al Historial; la de los ajustes (`settings.invest_*`) se migra sola |
| #62 | Detalle de cada inversión: mes a mes lo que aportas, lo que gana y el total; en móvil, «Editar» y «Eliminar inversión» debajo |
| #63 | Cambiar el patrimonio inicial elimina las inversiones con capital, con aviso y confirmación (la API lo exige: 409) |
| #64 | La copia de seguridad incluye las opciones de la gráfica (euros de hoy y su inflación, etc.) y las aplica al importarla |
| #65 | Este traspaso, puesto al día (#60–#64) |

Lo que el usuario eligió o dijo en cada una, para no volver a preguntarlo:
- **#60:** tope a lo invertido y a la aportación («Los dos»); la aportación se limita con lo que sobra **el mes que viene**.
- **#61:** «Varias» inversiones, en una «Pestaña junto a Historial».
- **#62:** «cuando lo clickes te aparezca el dinero que habrá cada mes (sumándole la ganancia del mes anterior) y la ganancia que dará cada mes; en iPhone sería igual con la diferencia que debajo tendría el botón de editar y el botón de eliminar inversión». En PC siguen en la fila de la tabla.
- **#63:** «En caso de querer cambiar el patrimonio inicial se eliminarán todas las inversiones arraigadas a la necesidad de ese capital, y se mostrará un aviso». Se entendió como las que tienen algo invertido (> 0 €); las que solo reciben aportaciones se quedan. Se le explicó y le pareció bien («perfect»).
- **#64:** pidió que la copia dijera la inflación. Van todas las opciones de la gráfica; el modo oscuro no (es de cada dispositivo).

Confirmado por el usuario en su iPhone: #53, #62 y que «Guardar copia» funciona (exportó una copia y abrió el `.json`). Falta que confirme en el iPhone:
- que «Elegir archivo…» deja escoger el `.json` desde Archivos e importarlo;
- #63 (el aviso y la confirmación al cambiar el patrimonio inicial);
- #64 (la inflación en una copia nueva; las anteriores no la llevan).

En #56 el usuario pidió (con sus palabras): que si va a pagar algo que le hará invertir menos, finan le avise y diga cuánto deja de invertir desde ese gasto; que «Este mes no» valga en todos sus dispositivos; y que la inversión **nunca dé nada por hecho** en meses sin datos (no le gusta que suponga aportaciones).

## Cómo probar en este entorno

Los scripts de prueba de sesiones anteriores vivían en el scratchpad y **no se conservan**. Hay que rehacerlos.

- **Backend:**
  ```bash
  cd backend && DATABASE_URL=sqlite:///<ruta>/prueba.db venv/bin/uvicorn app.main:app --port 8000
  ```
  Si no hay venv: `python -m venv venv && venv/bin/pip install -r requirements.txt`.
- **Frontend:**
  ```bash
  cd frontend && pnpm build && pnpm preview --port 4173
  ```
  `preview` reenvía `/api` al backend del puerto 8000. Tras cada cambio hay que volver a hacer `pnpm build` y reiniciar `preview`.
- **Playwright** (scripts `.cjs` o `.mjs`):
  - `.cjs`: ejecútalos con `NODE_PATH=/opt/node22/lib/node_modules node script.cjs`. `.mjs`: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'`.
  - Lanza Chromium con `executablePath: '/opt/pw-browsers/chromium'`.
  - Para móvil: `isMobile: true, hasTouch: true`.
  - Las preferencias del navegador (modo oscuro, gráfica, inflación) se fijan con `context.addInitScript(() => localStorage.setItem('finan-chart-inflation', '3'))`.
  - «Guardar copia»: Chromium no comparte archivos, así que descarga; captúralo con `page.waitForEvent('download')` (y `acceptDownloads: true`). Para importar: `page.locator('input[type=file]').setInputFiles(ruta)`.
  - **No hay WebKit**, así que los fallos propios de Safari/iOS no se pueden reproducir aquí. Hay que razonarlos y pedir al usuario que los confirme.
- **Postgres local** (para probar migraciones como en Neon):
  ```bash
  runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/finan-test -o "-p 5433" -l /var/lib/postgresql/pg.log -w start
  ```
  - Conéctate con `DATABASE_URL=postgresql://postgres@127.0.0.1:5433/<base>`.
  - Crea las bases con `ENCODING 'UTF8' TEMPLATE template0`; con SQL_ASCII, psycopg falla.
  - Si el clúster no existe en el contenedor nuevo, hay que crearlo con `initdb`.
- **Probar la API sin servidor:** desde `backend/`, `DATABASE_URL=sqlite:///<ruta>/prueba.db venv/bin/python script.py` con `from app.main import app` y `fastapi.testclient.TestClient` (o `from api.index import app` con `PYTHONPATH=<raíz del repo>`). El `TestClient` necesita `pip install httpx2` en el venv (no está en `requirements.txt`).
- **Con contraseña:** arranca el backend con `APP_PASSWORD=<clave>`; la pantalla de acceso se rellena con `getByLabel(/contraseña/i)` y el botón «Entrar».
- **Ojo con `pkill -f`:** si el patrón aparece en el propio comando de Bash, mata también esa shell. Mejor buscar el PID con `ps` y usar `kill`:
  ```bash
  for p in $(ps aux | grep -E "uvicorn app.main|vite preview" | grep -v grep | awk '{print $2}'); do kill $p; done
  ```
- **Datos de prueba habituales:**
  - IFM nómina 1800 € desde 2026-01-01;
  - GFM alquiler 750 € y súper 300 €;
  - GVM cena 60 € (2026-10-10) y regalo 150 € (2026-10-02);
  - patrimonio inicial 6420 € a 2026-10-15;
  - objetivo «Entrada piso», 20.000 €.
  
  Con esto, el objetivo se alcanza en mayo de 2028, el colchón es de 6,1 meses y desde noviembre sobran 750 €/mes.
- **No hay tests automáticos** en el repo (ni `pytest` ni tests de frontend). Las comprobaciones de cálculo se han hecho con scripts sueltos:
  - importando `frontend/src/lib/*.js` desde Node con un cargador que resuelve el alias `@/` (`node --import ./alias.mjs calc.mjs`):
    ```js
    // alias.mjs
    import { register } from 'node:module'
    register('./alias-hooks.mjs', import.meta.url)
    // alias-hooks.mjs
    const SRC = 'file:///home/user/finan/frontend/src/'
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith('@/')) {
        let url = SRC + specifier.slice(2)
        if (!/\.(js|jsx|mjs)$/.test(url)) url += '.js'
        return next(url, context)
      }
      return next(specifier, context)
    }
    ```
  - para comparar con la versión anterior: `git archive origin/main frontend/src | tar -x -C <dir>`, enlazar `frontend/node_modules` dentro y apuntar otro cargador a esa copia (así se comprobó en #61 que una sola inversión da lo mismo, al céntimo, que antes);
  - para el objetivo, comparando con la proyección real del backend.

## Particularidades técnicas a recordar

- **Migraciones:** no se usa Alembic, aunque `CLAUDE.md` lo menciona en el stack. Las columnas nuevas de un modelo se añaden solas con `add_missing_columns()` (en `database.py`), siempre que admitan NULL. Una columna quitada del modelo se queda en la base sin usarse; así está `settings.savings_target`.
- **Capas de la proyección** en `FinanceDataProvider`: API → `withInvestments` (rentabilidad de todas las inversiones, con lo que sobra cada mes sacado de la lista de flujos, `monthlySurplus`, y repartido entre ellas con `allocator`) → `inRealTerms` (inflación, si está activada). Hasta tener los ajustes y las inversiones no se entrega ninguna proyección, para no dibujar primero la línea sin la rentabilidad.
- **Inversiones** (`lib/investment.js`): `investmentOf` pasa la fila de la API a números; `portfolio` da lo que vale cada una (`value`) y su mes a mes (`months`); `freeFor` y `contributionPlan`, los topes del formulario; `investmentImpact`, lo que cambia lo invertido al añadir o editar un flujo («Así te afecta» y «Con 100 €/mes más»).
- **Cambios de datos al arrancar:** `ensure_schema()` (en `database.py`) crea las tablas, añade las columnas nuevas y ejecuta `migrations.run()`. Ahí se pasó la inversión única de `settings.invest_*` a la tabla `investments` (esas columnas quedan vacías y sin usar). Cualquier migración de datos futura va en `migrations.py`, idempotente y bloqueando la fila (`with_for_update`), porque Vercel puede arrancar varias instancias a la vez.
- **`PUT /settings`** responde 409 si cambia un patrimonio inicial ya fijado y hay inversiones con capital, salvo que lleve `remove_investments: true`.
- **Copia de seguridad:** el campo `chart` (opciones de la gráfica) lo da `null` la API y lo rellena el navegador; al importar, la API lo valida en modo estricto y el navegador lo aplica solo si la importación sale bien.
- **Fechas:** todo se maneja como texto `YYYY-MM-DD`. `parseISODate` crea fechas locales, sin zona horaria.
- **El linter (oxlint)** avisa de `new Date()` durante el render (`react(purity)`). Hay que calcularlo en un inicializador de `useState(() => …)` o en un callback.
- **Animación de la gráfica:** cualquier cambio en los puntos la repite. Hay que evitar cambios de datos en cascada al cargar.

## Particularidades de iOS (Safari)

- **Campos de fecha:** van sin aspecto nativo (`appearance: none` en `index.css`). Con el aspecto nativo, Safari ignoraba su ancho y su alto y se salían del modal (#53).
- **Modales:** solo se desplazan en vertical (`overflow-x-hidden`, `overscroll-contain`, `touch-pan-y` en `ui/dialog.jsx`).
- **Gráfica:** `touch-action: none`, sin selección ni menú al mantener el dedo y sin recuadros de foco. Recharts hace enfocables sus capas internas.
- **Pantalla principal en móvil:** fija y sin scroll (`h-dvh`). Todo lo que se añada debajo de la gráfica le quita alto a ella.

## Limitaciones conocidas y cosas sin probar

- **Pantallas bajas en móvil (≈667 px o menos, iPhone SE/8):** la gráfica tiene un alto mínimo (`min-h-40`) y, con la barra de la revisión, no cabe todo: la gráfica queda encima de la barra y no deja tocarla. Viene de #44. El usuario tiene un iPhone 16 Pro (402×874, no le afecta), así que no se ha arreglado.

## Ideas que quedaron sobre la mesa

Se propusieron y el usuario no las ha pedido todavía:
- **La fuga media como gasto previsto:** usar lo que se escapa al mes según el historial de revisiones como un gasto automático en la proyección, para que el futuro sea más realista.

Descartadas por el usuario (no volver a proponerlas):
- **Inversión como dos tramos** (líquido + invertido) en la gráfica. Prefiere ver solo el patrimonio total.
