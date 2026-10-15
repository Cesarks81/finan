## 1. Visión General del Proyecto
Aplicación web progresiva (PWA) de finanzas personales minimalista orientada a la **proyección y evolución del patrimonio neto a lo largo del tiempo** (con vistas por Días, Meses y Años - `D M A`).
* **Diseño:** Minimalista, centrado en la gráfica principal, 4 botones clave de flujo de caja y accesos rápidos de configuración (modo noche/luz).
* **Arquitectura:** Monolito separado (Frontend SPA en Vite+React / Backend API REST en FastAPI bajo `/api`). Se despliega como un único proyecto de Vercel (ver `DEPLOY.md`).
* **Alcance actual:** Mono-usuario (preparado estructuralmente para soportar multiusuario en el futuro).
* **Moneda:** Única (`€` EUR).

## 2. Stack Tecnológico
* **Backend:** Python con **FastAPI**
* **Base de Datos:** **SQLite** en local; **Postgres (Neon)** en producción, vía `DATABASE_URL`
* **ORM:** **SQLAlchemy** (con Alembic para migraciones)
* **Gestión de Entorno Python:** `venv` estándar con `pip`
* **Frontend:** **Vite + React**
* **Gestor de Paquetes Frontend:** **pnpm**
* **Estilos y Componentes UI:** **Tailwind CSS + shadcn/ui**
* **Librería de Gráficas:** Recharts (o Tremor)

## 3. Definición de Flujos Financieros y UI

### Clasificación de Transacciones
* **GVM (Gasto Variable Mensual):** Gastos espontáneos, caprichos o compras puntuales no planificadas, o temporales con duración finita (ej. financiar una consola: 200€/mes durante 3 meses).
* **GFM (Gasto Fijo Mensual):** Gastos recurrentes y predecibles basados en medias (alquiler, luz, agua, comida, gasolina).
* **IVM (Ingreso Variable Mensual):** Ingresos puntuales (trabajos extra, reparaciones) o temporales con duración finita (ej. cobro de deudas de 40€/mes durante 10 meses).
* **IFM (Ingreso Fijo Mensual):** Ingresos estables y recurrentes a largo plazo (nómina habitual).

### Patrimonio Inicial
* Se guarda en la tabla `settings` (una fila; `GET`/`PUT /settings`): importe (puede ser negativo) y fecha. La misma fila guarda el ahorro mensual deseado (`savings_target`) y el objetivo (`goal_name`, `goal_amount`), que se cambian con `PATCH /settings` (solo los campos enviados; `PUT` conserva el resto).
* Es el patrimonio **al empezar** esa fecha: los flujos desde ese día se suman o restan a partir de él y los anteriores reconstruyen la curva hacia atrás. Sin fecha, es el saldo previo a cualquier flujo.

### Disponible este mes
* «Págate primero»: con un ahorro mensual definido en Ajustes, *Disponible este mes* = ingresos del mes (IFM + IVM) − gastos fijos (GFM) − ese ahorro − gastos variables del mes (GVM, también la cuota de los que van a plazos) (`monthlyBudget` en `lib/budget.js`, a partir de `monthTotals`). Se muestra bajo el patrimonio en móvil y como pastilla en el encabezado en PC (`MonthlyBudget.jsx`), con una barra de lo que queda; si se pasa, «Este mes te has pasado X €»; si los ingresos no cubren fijos + ahorro, «Sin margen». Sin ahorro definido, invita a definirlo (abre Ajustes).

### Objetivo con fecha
* En Ajustes («Objetivo»: para qué e importe; «Quitar» lo borra). La fecha en que se alcanza sale de una proyección mensual de 40 años que se pide junto a las tres vistas (`long` en `lib/projections.js`): es el primer mes cuyo patrimonio llega al objetivo (`goalForecast` en `lib/goal.js`), y se calcula también con 100 €/mes más.
* En PC, tarjeta bajo los botones de flujo (`GoalCard.jsx`): progreso (patrimonio de hoy / objetivo, con barra), «Llegas en mayo de 2028» y «Con 100 €/mes más, en …»; «¡Objetivo conseguido!» si ya se alcanzó, o aviso si no se llega en 40 años. «Editar» abre Ajustes.
* En la gráfica de patrimonio (móvil y PC), línea horizontal discontinua azul en el importe del objetivo con la etiqueta «Meta 20K € · may 2028»; si queda por encima de la escala visible, solo la etiqueta arriba a la derecha con «↑».
* **Así te afecta:** al crear o editar un flujo, con el formulario completo, el modal muestra cómo cambia *Disponible este mes* y el mes del objetivo (`goalImpact`: suma o resta a la proyección larga lo que aporta el flujo mes a mes, sin el flujo editado, respetando la fecha del patrimonio inicial como hace el backend). Lo que empeora va en rojo y lo que mejora en verde.

### Lógica de Visualización y Responsividad
* **Vista PC:** encabezado con `finan` a la izquierda y, a la derecha, el valor del portfolio y el engranaje de ajustes. Debajo, dos columnas: a la izquierda la gráfica `EVOLUCIÓN PATRIMONIO` y el `Historial`; a la derecha, la pila de los 4 botones de flujo.
* **Vista Móvil:** encabezado solo con el valor del portfolio, el botón del Historial arriba a la izquierda y el engranaje arriba a la derecha, a la misma altura. Gráfica a todo el ancho, sin tarjeta (estilo Trade Republic) y con ejes discretos: fechas pequeñas debajo (las de los extremos alineadas hacia dentro) e importes dentro de la gráfica a la izquierda, tenues y sobre líneas guía muy suaves, y debajo los 4 botones apilados. Pantalla fija sin scroll (`h-dvh`, `overscroll-behavior: none`): la gráfica ocupa el alto que dejan libre el encabezado y los botones, y tiene `touch-action: none` para que arrastrar el dedo solo mueva el indicador. Con el dedo, la información de un punto solo se ve mientras se toca (aparece al tocar, aunque no se mueva, y se va al levantarlo); con el ratón, al pasar por encima. La información se coloca justo encima de lo más alto de las líneas en el tramo que ocupa (`TooltipAnchor`), para no taparlas; en horizontal sigue al dedo o al ratón. Aparece directamente en su sitio con un fundido muy rápido (150 ms) creciendo desde abajo, sin deslizarse desde otra posición; una vez visible, sí se desliza al arrastrar. Mientras la línea se dibuja (al cargar, al cambiar de vista o de modo y cuando cambian los datos) la gráfica no responde al dedo ni al ratón, para no cortar la animación; se marca con `data-drawing` en el DOM (no con estado de React, que volvería a pintar y la cortaría) y se libera al acabar. Al tocarla no se dibuja el recuadro de foco que el navegador pondría alrededor de la gráfica o del área tocada (Recharts hace enfocables la gráfica y sus capas internas), ni se selecciona ni abre el menú de iOS al mantener el dedo (`index.css`).
* **Selector `D M A`:** integrado dentro de la gráfica, en la esquina inferior derecha. Cambia la resolución temporal (Días, Meses, Años); cada cambio repite la animación de la línea dibujándose. En D (−15/+30 días) y M (−6/+12 meses) la línea «Hoy» cae a 1/3 del ancho, en el mismo sitio; en A (−2/+8 años) queda más a la izquierda. Con el ajuste «Vista de calendario»: D, el mes en curso del día 1 al último; M, el año en curso de enero a diciembre; A, 25 años desde el actual; la línea «Hoy» queda en el día, mes o año en que estamos. Las tres vistas se piden juntas al cargar (`lib/projections.js`) y quedan en caché en `FinanceDataProvider`: cambiar de vista no hace peticiones. Solo se vuelven a pedir tras un cambio de datos (`refresh()`), mostrando las anteriores mientras llegan. El patrimonio del encabezado sale de la vista de días.
* **Botones de flujo:** orden fijo GFM, GVM, IFM, IVM. Cada uno muestra a la izquierda el tipo (código y nombre) y a la derecha lo que suma ese tipo en el mes en curso (`monthTotals` en `lib/flowTypes.js`: puntuales con fecha en ese mes y el pago del mes de los recurrentes activos), en verde los ingresos y en rojo los gastos. Son el único punto para añadir flujos (no hay botón `+` global): el modal se abre ya con el tipo del botón pulsado, sin selector de tipo (solo al editar un flujo se puede cambiar). El formulario empieza por el importe (con el cursor ahí; en móvil sale el teclado numérico) y la fecha, y después el concepto. En móvil los modales se anclan arriba de la pantalla para que el teclado no tape los campos; en PC van centrados. La lista de flujos está en la caché de `FinanceDataProvider` y la comparten con el Historial.
* **Resumen de la gráfica** (discreto, en los dos modos; en móvil bajo el título, en PC arriba a la derecha a la altura del título, con la leyenda de «Ingresos y gastos» debajo). Mide cómo evoluciona lo ahorrado (ingresos − gastos) de un periodo al siguiente, por meses en D y M (día a día casi siempre es 0 €) y por años en A, con los datos de las vistas M y A en caché (`savingsTrend` en `lib/savingsStats.js`): *Media de ahorro*, la media de esos cambios en % (60 → 90 → 160 € son +50 % y +77,8 %: media +63,9 %), y *Tendencia*, si ese cambio se acelera o se frena, en puntos porcentuales por periodo (pendiente de la recta que mejor se ajusta a los cambios; con dos cambios, su diferencia: +27,8 p.p.). Un periodo con ahorro 0 no sirve de base y se salta; con base negativa se usa su valor absoluto. Verde si es positivo, rojo si es negativo, gris si redondea a 0; «—» si no hay datos suficientes.
* **Patrimonio inicial en la gráfica:** en la vista de patrimonio, si hay un patrimonio inicial en Ajustes (con fecha), una línea horizontal discontinua muy tenue marca su valor, sin etiqueta (solo si cae dentro de la escala visible).
* **Escala de la gráfica:** el eje Y se calcula a partir de los datos visibles (`yScale` en `NetWorthChart.jsx`): el máximo queda hacia el 40–50 % de la altura para dejar aire por encima, sin bajar de 0 si todo es positivo, y con marcas equidistantes de valores limpios (1, 2, 2,5 o 5 × 10ⁿ), abreviadas con K y M («12,5K €», `formatEURCompact`). En PC el eje Y ocupa solo lo que necesitan sus etiquetas y la gráfica deja el mismo margen a izquierda y derecha, alineada con el título.
* **Sección Historial:** en PC, tabla debajo de la gráfica; en móvil, el botón de la izquierda del encabezado (queda marcado mientras está activo) cambia los 4 botones de flujo por el Historial, en el mismo hueco: la gráfica no se mueve ni cambia de tamaño, y el Historial se desplaza por dentro. En móvil es una lista desplazable (concepto e importe; debajo, fecha y periodicidad) y tocar una fila abre el flujo para editarlo o eliminarlo. Lista los flujos con un filtro *Variables / Fijos / Terminados*; en *Terminados* van solo los que ya hicieron su último pago o cobro, para no ensuciar las otras dos; el importe se muestra tal cual y la periodicidad, siempre enmarcada, indica «Puntual», «Mensual» (si no tiene fin) o los meses que quedan («4 meses»), que van bajando con el tiempo hasta «Terminado». Cada fila se puede editar o eliminar, y el modal de edición incluye también «Eliminar» (con confirmación), así que cualquier flujo, fijo o variable, se puede modificar, terminar con una fecha de fin o borrar; la proyección se recalcula al momento.
* **Ajustes (engranaje):** modal con el interruptor de Modo Oscuro/Claro (Apariencia), los interruptores «Ingresos y gastos por separado» y «Vista de calendario» (Gráfica), el ahorro mensual, el patrimonio inicial, «Restablecer datos» y, si hay contraseña, «Cerrar sesión en este dispositivo». Los interruptores se guardan en el navegador (por dispositivo); los de la gráfica viven en `FinanceDataProvider` (`chart`), y cambiar «Vista de calendario» vuelve a pedir las tres vistas con las nuevas ventanas. El patrimonio inicial está en la caché de `FinanceDataProvider` (se carga al abrir la app y tras cada cambio), así que el modal se abre sin esperas. «Restablecer datos» tiene dos casillas, *Gastos* (GFM y GVM) e *Ingresos* (IFM e IVM), cada una con su número de flujos; el botón «Restablecer…» pide confirmación y borra de golpe los tipos marcados (`DELETE /api/flows?flow_type=…`, que exige indicar al menos un tipo). El patrimonio inicial no se toca.
* **Ingresos y gastos por separado:** con el ajuste activado, la gráfica (titulada «Ingresos y gastos», con leyenda) cambia la línea de patrimonio por dos líneas acumuladas desde el inicio de la vista: ingresos en azul (`--chart-1`) y gastos en rojo (`--expense`), cada una con el mismo degradado que la de patrimonio; la distancia entre ellas es lo ahorrado. La que llega más alto se dibuja detrás (`zIndex` de Recharts) para que su degradado no tape a la otra. El tooltip muestra ambos acumulados y su diferencia. Sale de los `income`/`expense` de las mismas proyecciones en caché, sin peticiones extra.

### Despliegue y Acceso
* **Producción:** Vercel sirve el frontend estático y ejecuta la API como función Python (`api/index.py`; `vercel.json` envía ahí `/api/*`). La base de datos es Postgres en Neon. Guía paso a paso en `DEPLOY.md`.
* **Contraseña (`APP_PASSWORD`):** si está definida, las rutas de datos exigen `Authorization: Bearer <token>`; el token se obtiene en `POST /api/auth/login`, tiene la forma `<caducidad>.<firma HMAC>` y **caduca a los 30 días** (firmado con la contraseña: cambiarla cierra todas las sesiones). `/api/health` y `/api/auth/*` son públicas. Sin `APP_PASSWORD` el acceso es libre en local, pero en Vercel se rechaza todo hasta configurarla.
* **Bloqueo por intentos fallidos:** cada 3 contraseñas incorrectas seguidas desde una IP, esa IP queda bloqueada (429 con `Retry-After`) 1 minuto, luego 2, 4, 8… (máximo 1 h). Cada fallo responde solo «Contraseña incorrecta» y la pantalla de acceso vacía el campo; durante el bloqueo se rechaza incluso la contraseña correcta y la pantalla muestra una cuenta atrás (a partir de `Retry-After`) con el campo y el botón desactivados. Acertar, o pasar 1 h sin fallos (desde el último fallo o el fin del último bloqueo), reinicia la cuenta. Se guarda en la tabla `login_attempts` (no en memoria, porque Vercel reparte las peticiones entre instancias) y la fila se bloquea durante cada intento para que los intentos simultáneos se cuenten de uno en uno. En Vercel la IP sale de `x-real-ip`/`x-forwarded-for`, que Vercel sobrescribe.
* **Frontend:** `AuthGate` consulta `/api/auth/status` y muestra la pantalla de acceso si hace falta; guarda el token en `localStorage` y vuelve al acceso ante cualquier 401.

## 4. Estructura del Repositorio

```
/
├── api/index.py            # Entrada de la función Python en Vercel (importa backend/app)
├── vercel.json             # Build del frontend, función Python y reescritura /api/*
├── requirements.txt        # Dependencias Python (las usa Vercel; backend/requirements.txt remite aquí)
├── DEPLOY.md               # Guía de despliegue en Vercel + Neon
├── backend/
│   ├── app/
│   │   ├── models.py       # Modelos SQLAlchemy: Flow (tabla única; tipo GFM/GVM/IFM/IVM), Settings y LoginAttempt
│   │   ├── schemas.py      # Validaciones Pydantic
│   │   ├── database.py     # Conexión: SQLite en local, Postgres con DATABASE_URL; crea las tablas y añade columnas nuevas
│   │   ├── auth.py         # Contraseña (APP_PASSWORD), token de 30 días y bloqueo por intentos fallidos
│   │   ├── projection.py   # Motor de cálculo del patrimonio proyectado
│   │   └── main.py         # App FastAPI bajo /api: health, auth, CRUD flows (y borrado por tipos), settings y projection
│   ├── requirements.txt    # `-r ../requirements.txt`
│   └── venv/
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── ui/         # Componentes shadcn/ui (Button, Card, Checkbox, Dialog, Select, Table, ToggleGroup…)
    │   │   └── *.jsx       # Gráfica (con selector D M A), botones y modal de flujo, Ajustes, Historial, disponible, objetivo (GoalCard), acceso
    │   ├── views/          # Dashboard principal (Layout PC vs. Mobile)
    │   ├── api/            # Cliente Fetch de la API (`/api` del mismo dominio; envía el token de sesión)
    │   ├── hooks/          # useTheme, useAuth, useFinanceData (recarga tras cambios), useMediaQuery, usePersistentState
    │   ├── lib/            # Formato (€, fechas), tipos de flujo, carga de las 3 vistas y la larga (projections.js), presupuesto (budget.js), objetivo (goal.js), cn()
    │   └── App.jsx
    ├── public/             # Favicon e iconos de la PWA (192, 512, maskable, apple-touch-icon)
    ├── vite.config.js      # Alias @/, Tailwind y PWA (vite-plugin-pwa: manifest + service worker)
    ├── components.json     # Configuración de shadcn/ui (JSX, estilo new-york)
    ├── package.json
    └── pnpm-lock.yaml
```

## 5. Comandos de Ejecución

* **Backend (FastAPI):**
  ```bash
  cd backend
  python -m venv venv
  source venv/bin/activate  # En Windows: venv\Scripts\activate
  pip install -r requirements.txt  # fastapi, uvicorn, sqlalchemy, psycopg, pydantic
  uvicorn app.main:app --reload
  ```
  La API queda en `http://127.0.0.1:8000/api` (documentación interactiva en `/api/docs`). Las tablas se crean en la primera petición (y las columnas nuevas de un modelo se añaden solas a las tablas existentes, solo si admiten NULL: `add_missing_columns`), en `backend/finance.db` salvo que `DATABASE_URL` apunte a otra base (p. ej. Postgres). `APP_PASSWORD` activa la contraseña. `CORS_ORIGINS` solo hace falta si el frontend llama a la API desde otro origen (`VITE_API_URL`).

* **Frontend (Vite + React + shadcn/ui):**
  ```bash
  cd frontend
  pnpm install
  pnpm dev     # http://localhost:5173; reenvía /api al backend en 127.0.0.1:8000
  pnpm build   # build de producción en frontend/dist (incluye manifest y service worker)
  pnpm preview # sirve la build en http://localhost:4173 (para probar la PWA)
  pnpm lint    # oxlint
  ```
  Nuevos componentes de shadcn/ui: `pnpm dlx shadcn@latest add <componente>` (usa `components.json`).
  Para abrirla desde el móvil en la red local basta `pnpm dev --host`: el móvil habla con Vite y Vite reenvía `/api` al backend del PC.
  El service worker solo se genera en la build (`pnpm build` / `pnpm preview`), no en `pnpm dev`. El service worker exige HTTPS (o `localhost`): sin él, Android no ofrece instalarla como app.
