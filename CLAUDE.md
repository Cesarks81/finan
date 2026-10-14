## 1. Visión General del Proyecto
Aplicación web progresiva (PWA) de finanzas personales minimalista orientada a la **proyección y evolución del patrimonio neto a lo largo del tiempo** (con vistas por Días, Meses y Años - `D M A`).
* **Diseño:** Minimalista, centrado en la gráfica principal, 4 botones clave de flujo de caja y accesos rápidos de configuración (modo noche/luz).
* **Arquitectura:** Monolito separado (Frontend SPA en Vite+React / Backend API REST en FastAPI).
* **Alcance actual:** Mono-usuario (preparado estructuralmente para soportar multiusuario en el futuro).
* **Moneda:** Única (`€` EUR).

## 2. Stack Tecnológico
* **Backend:** Python con **FastAPI**
* **Base de Datos:** **SQLite**
* **ORM:** **SQLAlchemy** (con Alembic para migraciones)
* **Gestión de Entorno Python:** `venv` estándar con `pip`
* **Frontend:** **Vite + React**
* **Gestor de Paquetes Frontend:** **pnpm**
* **Estilos y Componentes UI:** **Tailwind CSS + shadcn/ui**
* **Librería de Gráficas:** Recharts (o Tremor)

## 3. Definición de Flujos Financieros y UI

### Clasificación de Transacciones
* **GVM (Gasto Variable Mensual):** Gastos espontáneos, caprichos o compras puntuales no planificadas.
* **GFM (Gasto Fijo Mensual):** Gastos recurrentes y predecibles basados en medias (alquiler, luz, agua, comida, gasolina).
* **IVM (Ingreso Variable Mensual):** Ingresos puntuales (trabajos extra, reparaciones) o temporales con duración finita (ej. cobro de deudas de 40€/mes durante 10 meses).
* **IFM (Ingreso Fijo Mensual):** Ingresos estables y recurrentes a largo plazo (nómina habitual).

### Patrimonio Inicial
* Se guarda en la tabla `settings` (una fila; `GET`/`PUT /settings`): importe (puede ser negativo) y fecha.
* Es el patrimonio **al empezar** esa fecha: los flujos desde ese día se suman o restan a partir de él y los anteriores reconstruyen la curva hacia atrás. Sin fecha, es el saldo previo a cualquier flujo.

### Lógica de Visualización y Responsividad
* **Selector `D M A`:** Cambia la resolución temporal de la gráfica (Días, Meses, Años).
* **Sección History (Histórico):** **Exclusiva para la vista de PC** (ubicada debajo de la gráfica). Lista y detalla el historial de movimientos **variables** (gastos e ingresos temporales/puntuales).
* **Barra de Controles:** Selector de Modo Noche/Luz y botón `+` de acción rápida para el registro de flujos.

## 4. Estructura del Repositorio

```
/
├── backend/
│   ├── app/
│   │   ├── models.py       # Modelos SQLAlchemy: Flow (tabla única; tipo GFM/GVM/IFM/IVM) y Settings
│   │   ├── schemas.py      # Validaciones Pydantic
│   │   ├── database.py     # Conexión SQLite
│   │   ├── projection.py   # Motor de cálculo del patrimonio proyectado
│   │   └── main.py         # App FastAPI: /health, CRUD /flows, /settings y /projection
│   ├── requirements.txt
│   └── venv/
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── ui/         # Componentes shadcn/ui (Button, Card, Dialog, Select, Table, ToggleGroup…)
    │   │   └── *.jsx       # Gráfica, botones y modal de flujo, patrimonio inicial, History, barra de acción
    │   ├── views/          # Dashboard principal (Layout PC vs. Mobile)
    │   ├── api/            # Cliente Fetch de la API (VITE_API_URL; por defecto, puerto 8000 del mismo host)
    │   ├── hooks/          # useTheme (modo noche/luz) y useFinanceData (recarga tras cambios)
    │   ├── lib/            # Formato (€, fechas), metadatos de los tipos de flujo, cn()
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
  pip install -r requirements.txt  # fastapi, uvicorn, sqlalchemy, pydantic
  uvicorn app.main:app --reload
  ```
  La API queda en `http://127.0.0.1:8000` (documentación interactiva en `/docs`). Las tablas se crean al arrancar en `backend/finance.db`; `DATABASE_URL` y `CORS_ORIGINS` permiten cambiar la base de datos y los orígenes permitidos (por defecto, `localhost`/`127.0.0.1` en los puertos 5173 y 4173).

* **Frontend (Vite + React + shadcn/ui):**
  ```bash
  cd frontend
  pnpm install
  pnpm dev     # http://localhost:5173 (necesita el backend arrancado)
  pnpm build   # build de producción en frontend/dist (incluye manifest y service worker)
  pnpm preview # sirve la build en http://localhost:4173 (para probar la PWA)
  pnpm lint    # oxlint
  ```
  Nuevos componentes de shadcn/ui: `pnpm dlx shadcn@latest add <componente>` (usa `components.json`).
  El service worker solo se genera en la build (`pnpm build` / `pnpm preview`), no en `pnpm dev`. El service worker exige HTTPS (o `localhost`): sin él, Android no ofrece instalarla como app.
