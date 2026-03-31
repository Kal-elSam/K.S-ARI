# ARI — Agendamiento por WhatsApp

Monorepo con **API Express** (`api/`), **panel Next.js** (`dashboard/`), **PostgreSQL** y **Docker Compose** para levantar todo en local.

## Requisitos previos

- **Node.js** 18+ (recomendado LTS)
- **npm** (viene con Node)
- **Docker Desktop** o **OrbStack** (recomendado para Postgres + API + n8n sin instalar Postgres en el host)
- Cuentas/claves según lo que uses: Meta WhatsApp, Groq, Google OAuth (Calendar), etc.

## Estructura rápida

| Carpeta | Descripción |
|---------|-------------|
| `api/` | Servidor Express: webhook WhatsApp, OAuth Google, REST `/api/*` |
| `dashboard/` | Panel de control Next.js (puerto **3001**) |
| `docker-compose.yml` | Postgres, API en contenedor, n8n |
| `database.sql` | Esquema SQL (incluye tablas y seed de ejemplo) |

## Variables de entorno

En la **raíz del repo** crea un archivo `.env` (no lo subas a git; ya está en `.gitignore`).

Variables que usa la API (nombres orientativos; valores reales solo en tu máquina):

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto del API (por defecto `3000`) |
| `DATABASE_URL` | Conexión Postgres (ver sección Docker vs local) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WEBHOOK_VERIFY_TOKEN` | Meta WhatsApp |
| `GROQ_API_KEY` | LLM (Groq) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth Calendar |

**Importante con Docker:** en `docker-compose.yml` el servicio `api` fuerza `DATABASE_URL` apuntando al host `postgres` dentro de la red Docker. Tu `.env` puede seguir teniendo `localhost` para cuando ejecutes el API **fuera** de Docker.

---

## Opción A — Todo con Docker (recomendado)

Levanta Postgres, API, n8n y expone la API en `http://localhost:3000`.

### 1. Clonar e instalar dependencias del dashboard (para desarrollo del panel)

```bash
git clone <tu-repo> ari
cd ari
npm install --prefix dashboard
```

### 2. Configurar `.env` en la raíz

Copia y rellena según tus credenciales (mínimo lo que exige `api/src/server.js`).

### 3. Construir e iniciar servicios

```bash
docker compose build api
docker compose up -d
```

Servicios típicos:

- **API:** `http://localhost:3000` (health: `GET /health`)
- **Postgres:** `localhost:5432` (usuario `ari`, contraseña `ari_password`, base `ari_db`)
- **n8n:** `http://localhost:5678`

### 4. Aplicar esquema SQL (primera vez o base nueva)

Con Postgres ya arriba:

```bash
# Desde la raíz del repo, cargando DATABASE_URL del .env
set -a && source .env && psql "$DATABASE_URL" -f database.sql
```

Si solo usas Docker y tu `.env` apunta a `localhost:5432`, ese comando aplica al contenedor expuesto en el host.

### 5. Panel Next.js (en otra terminal)

```bash
cd dashboard
npm run dev
```

Abre **`http://localhost:3001`**. El dashboard llama al API en **`http://localhost:3000`** (definido en `dashboard/lib/api.ts`).

### 6. Probar endpoints del API (opcional)

Con el API escuchando en `3000`:

```bash
cd api
node test-endpoints.js
```

---

## Opción B — API y dashboard en el host (sin contenedor del API)

Útil si quieres `node --watch` directo en tu máquina. Necesitas **Postgres** accesible (solo contenedor de Postgres, o instalación local).

### 1. Postgres

- Con Docker solo la base:

  ```bash
  docker compose up -d postgres
  ```

  Entonces en `.env`:

  `DATABASE_URL=postgres://ari:ari_password@localhost:5432/ari_db`

### 2. Esquema

```bash
set -a && source .env && psql "$DATABASE_URL" -f database.sql
```

### 3. API (carpeta `api`)

```bash
cd api
npm install
npm run dev
```

Por defecto usa `PORT` del `.env` (3000).

### Conflicto de puerto `3000` (EADDRINUSE)

Si **OrbStack/Docker** ya publica la API en **3000**, no puedes tener **dos** procesos en el mismo puerto. Opciones:

- Deja solo Docker para el API y **no** ejecutes `npm run dev` en `api`, **o**
- Para el stack que usa el 3000 y levanta solo lo que necesites, **o**
- Ejecuta el API local en otro puerto:

  ```bash
  PORT=3002 npm run dev
  ```

  y cambia temporalmente `BASE_URL` en `dashboard/lib/api.ts` a `http://localhost:3002` (o usa una variable de entorno en el front si la añades).

### 4. Dashboard

```bash
cd dashboard
npm install
npm run dev
```

---

## URLs útiles

| Qué | URL |
|-----|-----|
| API (salud) | `http://localhost:3000/health` |
| OAuth Google (Calendar) | `http://localhost:3000/auth/google` |
| Webhook Meta (según config) | `http://localhost:3000/webhook` |
| Panel | `http://localhost:3001` |
| n8n (si usas compose completo) | `http://localhost:5678` |

## Ngrok: cuándo se usa y cómo usarlo

### Cuándo **no** hace falta ngrok

- Desarrollas o pruebas el **dashboard** contra el API en `http://localhost:3000`.
- Ejecutas **`node api/test-endpoints.js`** o llamas a `/api/*` desde el navegador o Postman en tu mismo equipo.
- **No** estás configurando ni recibiendo el webhook de **WhatsApp Cloud API** desde internet.

En esos casos todo es tráfico local; Meta no interviene.

### Cuándo **sí** necesitas ngrok (o un túnel / deploy público)

Meta **solo** puede llamar a URLs **públicas** y **HTTPS**. Tu API en `localhost:3000` **no** es visible desde Internet, así que:

- Para **verificar el webhook** en Meta Developer (suscripción al `GET /webhook` con `hub.verify_token`).
- Para **recibir mensajes reales** de WhatsApp (POST al `/webhook`).
- Para probar el flujo completo bot + API en tu máquina mientras Meta envía eventos.

**Alternativas a ngrok:** Cloudflare Tunnel, localtunnel, o desplegar el API en un servidor con dominio público (Railway, VPS, etc.) y registrar esa URL en Meta.

### Cómo usar ngrok en este proyecto (flujo recomendado)

1. **Levanta el API** en el puerto que vayas a exponer (normalmente **3000**), con Docker o `npm run dev` en `api/`. Comprueba que responda: `curl http://localhost:3000/health`.

2. **En otra terminal**, expone ese puerto:

   ```bash
   npx ngrok http 3000
   ```

   Si tu API corre en otro puerto (por ejemplo `3002`), usa ese número: `npx ngrok http 3002`.

3. Ngrok muestra una URL **HTTPS** (ej. `https://xxxx.ngrok-free.app`). Esa es la base pública.

4. En **Meta for Developers** → tu app → WhatsApp → **Configuration** (o Webhooks):

   - **Callback URL:** `https://xxxx.ngrok-free.app/webhook` (sin barra final extra; debe coincidir con tu ruta en Express).
   - **Verify token:** el mismo valor que `WEBHOOK_VERIFY_TOKEN` en tu `.env`.

5. Guarda / verifica en Meta. Si el API está arriba y el token coincide, Meta hará el `GET` de verificación contra tu túnel.

6. Mientras desarrollas, **deja ngrok y el API corriendo**. Si cierras ngrok, la URL cambia (en plan gratuito) y tendrás que actualizar la URL en Meta.

7. El **panel** (`localhost:3001`) sigue igual: no usa ngrok; solo el tráfico **Meta → tu webhook** pasa por la URL pública.

### Resumen rápido

| Qué haces | ¿Ngrok? |
|-----------|---------|
| Panel + API solo en local | No |
| Probar REST / `test-endpoints.js` | No |
| Webhook WhatsApp con Meta en la nube | Sí (túnel o deploy) |

## Scripts rápidos

| Ubicación | Comando | Descripción |
|-----------|---------|-------------|
| `api/` | `npm run dev` | API con recarga (`node --watch`) |
| `api/` | `npm start` | API sin watch |
| `dashboard/` | `npm run dev` | Next en puerto **3001** |
| `dashboard/` | `npm run build` | Build de producción |
| Raíz / `api/` | `node api/test-endpoints.js` | Smoke test de endpoints REST (API en 3000) |

## Problemas frecuentes

1. **`EADDRINUSE` en el puerto 3000**  
   Ya hay otro proceso (a menudo Docker/OrbStack). Ver sección “Conflicto de puerto” arriba.

2. **API en Docker no conecta a Postgres**  
   El `docker-compose` define `DATABASE_URL` con host `postgres`. No uses `localhost` dentro del contenedor del API.

3. **Panel no carga datos**  
   Comprueba que el API responda en la misma URL que `dashboard/lib/api.ts` (`BASE_URL`) y que CORS en el API permita el origen del panel (`http://localhost:3001`).

4. **Hydration warnings en Next**  
   Pueden venir de extensiones del navegador que modifican el DOM; prueba en ventana de incógnito sin extensiones.

---

## Licencia / equipo

Ajusta esta sección según tu proyecto.
