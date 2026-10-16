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
- **Antes de cada PR:** `pnpm lint` y `pnpm build` en `frontend/`, prueba en el navegador con Playwright (móvil 390×844 y PC 1280×900, a veces también 320 y 360 de ancho), y `CLAUDE.md` actualizado con lo que cambie.
- **Al terminar:** un resumen corto y claro en español, sin jerga técnica. Si algo no se pudo probar, se dice.
- El usuario prueba en su **iPhone (Safari)** sobre el despliegue de Vercel y manda capturas. Lo que en Chromium va bien puede fallar en iOS (ver «Particularidades de iOS»).

## Gustos del usuario (aprendidos por el camino)

- Minimalismo: datos discretos, sutiles y sin ruido. Estética de Trade Republic en móvil.
- Nada de textos de ejemplo (placeholders) dentro de los campos.
- Lo justo en pantalla. Ya se quitaron, a petición suya:
  - el «Disponible este mes» y el ahorro mensual;
  - la media de ahorro, la tendencia y la tasa de ahorro (del resumen de la gráfica solo queda el colchón).
- Detalles de interacción cuidados: animaciones que no se cortan, la información de un punto solo mientras se toca, sin recuadros de foco ni selección al tocar.
- Prefiere que las cuentas sean realistas aunque sean menos simples: p. ej. no invertir nunca más de lo que sobra cada mes.
- Cuando duda de un concepto financiero, pregunta. Explícalo con sus propios números antes de cambiar nada.

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

El usuario confirmó que #53 se ve bien en su iPhone.

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
- **Playwright** (scripts `.cjs`):
  - Ejecútalos con `NODE_PATH=/opt/node22/lib/node_modules node script.cjs`.
  - Lanza Chromium con `executablePath: '/opt/pw-browsers/chromium'`.
  - Para móvil: `isMobile: true, hasTouch: true`.
  - **No hay WebKit**, así que los fallos propios de Safari/iOS no se pueden reproducir aquí. Hay que razonarlos y pedir al usuario que los confirme.
- **Postgres local** (para probar migraciones como en Neon):
  ```bash
  runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/finan-test -o "-p 5433" -l /var/lib/postgresql/pg.log -w start
  ```
  - Conéctate con `DATABASE_URL=postgresql://postgres@127.0.0.1:5433/<base>`.
  - Crea las bases con `ENCODING 'UTF8' TEMPLATE template0`; con SQL_ASCII, psycopg falla.
  - Si el clúster no existe en el contenedor nuevo, hay que crearlo con `initdb`.
- **Probar la API sin servidor:** `from api.index import app` con `fastapi.testclient.TestClient`, ejecutado con `PYTHONPATH=<raíz del repo>`.
- **Datos de prueba habituales:**
  - IFM nómina 1800 € desde 2026-01-01;
  - GFM alquiler 750 € y súper 300 €;
  - GVM cena 60 € (2026-10-10) y regalo 150 € (2026-10-02);
  - patrimonio inicial 6420 € a 2026-10-15;
  - objetivo «Entrada piso», 20.000 €.
  
  Con esto, el objetivo se alcanza en mayo de 2028, el colchón es de 6,1 meses y desde noviembre sobran 750 €/mes.
- **No hay tests automáticos** en el repo (ni `pytest` ni tests de frontend). Las comprobaciones de cálculo se han hecho con scripts sueltos:
  - copiando el archivo de `lib/` a un `.mjs` y cambiando con `sed` los alias `@/lib/...` por rutas relativas;
  - para el objetivo, comparando con la proyección real del backend.

## Particularidades técnicas a recordar

- **Migraciones:** no se usa Alembic, aunque `CLAUDE.md` lo menciona en el stack. Las columnas nuevas de un modelo se añaden solas con `add_missing_columns()` (en `database.py`), siempre que admitan NULL. Una columna quitada del modelo se queda en la base sin usarse; así está `settings.savings_target`.
- **Capas de la proyección** en `FinanceDataProvider`: API → `withInvestment` (rentabilidad) → `inRealTerms` (inflación, si está activada). Hasta tener los ajustes no se entrega ninguna proyección, para no dibujar primero la línea sin la inversión.
- **Fechas:** todo se maneja como texto `YYYY-MM-DD`. `parseISODate` crea fechas locales, sin zona horaria.
- **El linter (oxlint)** avisa de `new Date()` durante el render (`react(purity)`). Hay que calcularlo en un inicializador de `useState(() => …)` o en un callback.
- **Animación de la gráfica:** cualquier cambio en los puntos la repite. Hay que evitar cambios de datos en cascada al cargar.

## Particularidades de iOS (Safari)

- **Campos de fecha:** van sin aspecto nativo (`appearance: none` en `index.css`). Con el aspecto nativo, Safari ignoraba su ancho y su alto y se salían del modal (#53).
- **Modales:** solo se desplazan en vertical (`overflow-x-hidden`, `overscroll-contain`, `touch-pan-y` en `ui/dialog.jsx`).
- **Gráfica:** `touch-action: none`, sin selección ni menú al mantener el dedo y sin recuadros de foco. Recharts hace enfocables sus capas internas.
- **Pantalla principal en móvil:** fija y sin scroll (`h-dvh`). Todo lo que se añada debajo de la gráfica le quita alto a ella.

## Limitaciones conocidas y cosas sin probar

- **«Así te afecta»:** no recalcula el tope de las aportaciones de la inversión con el flujo nuevo. Puede desviarse unos euros. Está documentado en `CLAUDE.md`.
- **Revisión mensual:** el aviso de «Este mes no» se guarda por dispositivo (`localStorage`), no en el servidor.
- **«Cerrar sesión en este dispositivo»:** la fila del menú de Ajustes no se ha probado con `APP_PASSWORD` configurada.
- **Meses sin datos en el plan de inversión:** un mes anterior a la vista M o posterior a los 40 años de la proyección larga usa la aportación mensual sin tope. En la práctica solo pasa si la inversión se guardó hace más de 6 meses.

## Ideas que quedaron sobre la mesa

Se propusieron y el usuario no las ha pedido todavía:
- **Historial de revisiones mensuales:** guardar cada «previsto frente a real» para ver si las fugas bajan.
- **Exportar e importar los flujos:** una copia de seguridad en archivo.
- **Inversión como dos tramos** (líquido + invertido) en la gráfica. El usuario eligió ver solo el patrimonio total.
