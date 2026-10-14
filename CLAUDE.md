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

### Lógica de Visualización y Responsividad
* **Selector `D M A`:** Cambia la resolución temporal de la gráfica (Días, Meses, Años).
* **Sección History (Histórico):** **Exclusiva para la vista de PC** (ubicada debajo de la gráfica). Lista y detalla el historial de movimientos **variables** (gastos e ingresos temporales/puntuales).
* **Barra de Controles:** Selector de Modo Noche/Luz y botón `+` de acción rápida para el registro de flujos.

## 4. Estructura del Repositorio

```
/
├── backend/
│   ├── app/
│   │   ├── models.py       # Modelos SQLAlchemy (Transaction, RecurringFlow, TemporalFlow)
│   │   ├── schemas.py      # Validaciones Pydantic
│   │   ├── database.py     # Conexión SQLite
│   │   └── main.py         # Endpoints FastAPI y motor de cálculo de patrimonio
│   ├── requirements.txt
│   └── venv/
└── frontend/
    ├── src/
    │   ├── components/     # Componentes de shadcn/ui (Chart, Dialog, Button, Card, Table)
    │   ├── views/          # Dashboard principal (Layout PC vs. Mobile)
    │   ├── api/            # Cliente de llamadas Axios/Fetch
    │   └── App.jsx
    ├── package.json
    └── pnpm-lock.yaml
```

## 5. Comandos de Ejecución

* **Backend (FastAPI):**
  ```bash
  cd backend
  python -m venv venv
  source venv/bin/activate  # En Windows: venv\Scripts\activate
  pip install -r requirements.txt  # fastapi, uvicorn, sqlalchemy, alembic, pydantic
  uvicorn app.main:app --reload
  ```

* **Frontend (Vite + React + shadcn/ui):**
  ```bash
  cd frontend
  pnpm install
  pnpm dev
  ```
