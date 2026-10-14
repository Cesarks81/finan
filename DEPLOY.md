# Despliegue en Vercel + Neon

La app se publica como un único proyecto de Vercel:

- **Frontend** (`frontend/`): se construye con `pnpm build` y Vercel lo sirve como web estática por HTTPS, así que la PWA se puede instalar en el móvil.
- **API** (`backend/`): Vercel la ejecuta como función Python. `vercel.json` envía a `api/index.py` todas las peticiones a `/api/*`.
- **Base de datos**: Postgres en Neon. SQLite no sirve en Vercel, porque el disco de las funciones no se conserva entre ejecuciones.
- **Acceso**: la API exige la contraseña de `APP_PASSWORD`. Sin ella, en Vercel la API rechaza todas las peticiones.

Todo cabe en los planes gratuitos (Vercel Hobby y Neon Free) para un solo usuario.

## 1. Importar el proyecto en Vercel

1. Entra en <https://vercel.com> con tu cuenta de GitHub.
2. **Add New… → Project** e importa el repositorio `Cesarks81/finan`.
3. Deja **Root Directory** en la raíz del repositorio (`./`) y **Framework Preset** en *Other*: los comandos de build ya están en `vercel.json`.
4. Pulsa **Deploy**. El frontend se publicará, pero la API fallará hasta completar los pasos 2 y 3.

## 2. Crear la base de datos (Neon)

1. En el proyecto de Vercel, abre la pestaña **Storage → Create Database** y elige **Neon** (Serverless Postgres).
2. Elige la región más cercana (por ejemplo, Frankfurt) y conéctala al proyecto en todos los entornos.
3. Vercel añade automáticamente la variable `DATABASE_URL`. Las tablas se crean solas en la primera petición.

Opcional: en **Settings → Functions**, pon la región de las funciones en la misma ciudad que la base de datos (por ejemplo, Frankfurt, `fra1`) para que cada consulta tarde menos.

## 3. Definir la contraseña

1. En **Settings → Environment Variables**, añade `APP_PASSWORD` con una contraseña larga (una frase de cuatro o cinco palabras sirve) en *Production* y *Preview*.
2. Las variables solo se aplican a despliegues nuevos: en **Deployments**, abre el último y pulsa **Redeploy**.

Cambiar `APP_PASSWORD` (y volver a desplegar) cierra la sesión en todos los dispositivos.

## 4. Comprobar

- `https://<tu-proyecto>.vercel.app/api/health` debe responder `{"status":"ok","database":"ok"}`.
- `https://<tu-proyecto>.vercel.app` muestra la pantalla de acceso; tras la contraseña, la app (vacía la primera vez).
- La documentación de la API está en `/api/docs`.

## 5. Instalar en el móvil

- **iPhone (Safari)**: abre la URL, pulsa **Compartir → Añadir a pantalla de inicio**.
- **Android (Chrome)**: abre la URL, menú **⋮ → Instalar aplicación** (o *Añadir a pantalla de inicio*).

Se abre a pantalla completa, sin barras del navegador. La contraseña se pide una vez por dispositivo; **Ajustes → Cerrar sesión en este dispositivo** la olvida.

## Despliegues siguientes

Cada push a la rama principal despliega de nuevo automáticamente; cada pull request genera una URL de vista previa (que también pide la contraseña).

## Desarrollo local

No necesita Vercel ni Postgres: el backend usa SQLite (`backend/finance.db`) y, sin `APP_PASSWORD`, no pide contraseña. Ver los comandos en `CLAUDE.md`. Para probar en local contra Postgres o con contraseña:

```bash
DATABASE_URL=postgresql://usuario:clave@host/base APP_PASSWORD=prueba uvicorn app.main:app --reload
```
