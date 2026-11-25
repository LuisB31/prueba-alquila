# AlquilaPTY

Plataforma inmobiliaria de Panamá: alquiler y venta de propiedades, subastas inversas, roommates, calculadora de ROI e hipoteca, mapa interactivo, comparador y asistente.

El proyecto está dividido en **frontend** (lo que ve el navegador) y **backend** (API REST con la lógica y los datos), que se comunican solo por HTTP + JSON.

```
Navegador ──(fetch JSON)──▶  /api/*  ──▶ routes ──▶ services ──▶ data/*.json
 frontend/                    backend/
```

## Ejecutar

```bash
npm install
npm start            # http://localhost:3000  (sirve el frontend y la API)
npm test             # 34 pruebas (API, cuentas, Holding y persistencia en BD)
```

`npm run dev` reinicia el servidor al guardar cambios.

## Estructura

```
backend/
  server.js            arranca el servidor (puerto, mensajes)
  app.js               arma Express: compresión, CORS, /api, archivos estáticos, errores
  config.js            puerto, CORS, URL del sitio, tasas y reglas de negocio
  routes/              HTTP ⇄ servicios (validan entrada y devuelven JSON)
  services/            lógica de negocio, sin depender de Express
    finance.service.js   hipoteca, plusvalía, costo mensual  ← única fuente de estas fórmulas
    properties.service.js  búsqueda, detalle, mapa, subastas, publicar, comparar
    roommates / account / assistant .service.js
    store.js             "base de datos" en memoria (carga data/*.json)
  middleware/          errores uniformes, validación, plan demo
  data/                propiedades, roommates, catálogos (JSON)
  test/api.test.js

frontend/
  index.html           estructura + SEO (title, description, Open Graph, JSON-LD)
  css/tailwind.css     generado con `npm run build:css` (no editar a mano)
  css/styles.css       estilos propios (visibilidad por plan, animaciones)
  js/main.js           punto de entrada: conecta módulos, rutas por URL, arranque
  js/core/             api.js (cliente del backend), dom.js (plantillas seguras), ui.js, state.js
  js/modules/          una pantalla por archivo: properties, map, roommates, auctions, …
  robots.txt, sitemap.xml, assets/
```

**Regla de oro:** el frontend no calcula nada de negocio. Pide datos a la API y los pinta. Así, por ejemplo, la cuota hipotecaria se calcula en un solo lugar (`finance.service.js`).

## Comunicación frontend ⇄ backend

Todo pasa por `frontend/js/core/api.js`: ningún otro archivo usa `fetch`. Esa capa:

- envía y recibe JSON y añade la cabecera `X-Demo-Plan` (plan activo del simulador);
- convierte cualquier fallo en un mensaje legible y muestra un botón **Reintentar**;
- cancela peticiones obsoletas (si mueves un filtro rápido, solo cuenta la última);
- limita el tiempo de espera (10 s) y reutiliza datos fijos (destinos, puntos del mapa);
- espera 250 ms tras dejar de escribir antes de buscar (`debounce`).

Los errores del backend siempre tienen la misma forma: `{ "error": { "status": 400, "message": "…" } }`.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/properties?tx=&zone=&type=&bedrooms=&pets=&auction=&maxPrice=&q=` | Listado filtrado |
| GET | `/api/properties/:id` | Detalle (galería, cercanías, costo mensual, ROI) |
| GET | `/api/properties/:id/commute?dest=` | Tiempo y costo de traslado |
| GET | `/api/properties/top-neighborhoods` | Ranking de zonas |
| POST | `/api/properties` | Publicar propiedad (+30 pts) |
| POST | `/api/properties/:id/contact` | Contactar al publicador (+10 pts) |
| GET | `/api/auctions` · POST `/api/auctions/:id/offers` | Subastas inversas y ofertas |
| GET | `/api/roommates?gender=&age=&occupation=&schedule=&pets=` | Búsqueda de roommates |
| POST | `/api/roommates/profile` · `/api/roommates/:id/messages` | Perfil propio y mensajes |
| GET | `/api/investments/:id?downPct=&years=` | Plusvalía 5/10/15 años + hipoteca + histórico |
| GET | `/api/comparison?ids=1,2,3` | Tabla y radar de comparación |
| GET | `/api/map/pins` · `/api/map/pois` | Pines y capas del mapa |
| POST | `/api/assistant/chat` | Chat con el asistente |
| POST | `/api/auth/register` | Registro: `{ plan, firstName, lastName, email, password, companyName?, payment? }` |
| POST | `/api/auth/login` · `/api/auth/logout` · GET `/api/auth/session` | Inicio y cierre de sesión |
| GET | `/api/accounts/me` · POST `/api/rewards/redeem` | Perfil y puntos |
| GET | `/api/accounts/me/activity` | Mis propiedades (venta / alquiler) e historial |
| POST | `/api/properties/:id/acquire` | Alquilar o comprar (simulado) |
| GET | `/api/holding/team`, `/api/holding/stats` | Empresa, código, agentes, propiedades e ingresos |
| POST | `/api/holding/agents`, `/api/holding/switch` | Agregar agente (con código) y cambiar de agente |
| GET · POST · DELETE | `/api/favorites`, `/api/favorites/:propertyId` | Mis favoritos, guardar y quitar |
| GET | `/api/chats` | Bandeja de mensajes (`unread` = no leídos) |
| POST | `/api/chats` `{ propertyId, text? }` | Abrir (o retomar) el chat con el propietario (+10 pts la primera vez) |
| GET | `/api/chats/:id?after=N` | Mensajes desde el id N; marca como leídos |
| POST | `/api/chats/:id/messages` `{ text }` | Enviar mensaje (solo los dos participantes) |
| GET | `/api/health` | Comprobación de estado |

## Cuentas, planes y empresas

- **Registro:** primero se elige el plan.
  - **Free:** nombre, apellido, correo y contraseña.
  - **Premium:** lo mismo más un pago **simulado** ($3).
  - **Holding:** nombre de la empresa, primer agente y pago simulado ($12). Al pagar se genera un **código de 4 dígitos único por empresa**.
- **Agentes Holding:** cada empresa admite hasta **5 agentes**. Para agregar uno se pide el código de esa empresa; el código de otra empresa no sirve.
- **Perfil:** muestra las propiedades del usuario en venta y en alquiler, y el historial de lo que ha alquilado o comprado (botón "Alquilar/Comprar" en el detalle).
- **Panel Holding:** conteos de propiedades en venta y alquiler, lista con el agente de cada una, e ingresos de los últimos 6 meses en una gráfica (ventas en barras, alquileres en línea).
- **Seguridad:**
  - Las contraseñas se guardan con hash `scrypt` y la sesión usa un token `Authorization: Bearer`.
  - Del pago solo se guardan los 4 últimos dígitos de la tarjeta; nunca se cobra nada.
  - Para probar, usa la tarjeta 4242 4242 4242 4242.
- **Simulador de planes:** sigue disponible sin iniciar sesión y usa cuentas demo (`juan@demo.pa`, `ricardo@demo.pa` y `sara@panacasas.pa`, contraseña `demo1234`). Con una sesión iniciada se oculta.

## SEO

- `<title>` y `description` propios, **y distintos por pestaña** (se actualizan al navegar).
- Cada vista tiene URL compartible: `#/roommates`, `#/zona/Obarrio`, `#/propiedad/3`.
- Open Graph y Twitter Card, `canonical`, `robots`, JSON-LD (`Organization`, `WebSite`, `WebPage`) y un `ItemList` con las propiedades visibles.
- `robots.txt` y `sitemap.xml` (dinámicos en el backend; copias estáticas en `frontend/`).
- HTML semántico (`<main>`, `<nav>`, `<footer>`, `<article>`, un solo `<h1>`), enlace “saltar al contenido”, `alt` en todas las imágenes, etiquetas accesibles en formularios, modales con `role="dialog"` y cierre con Esc.
- Rendimiento: Tailwind compilado (34 KB, antes ~350 KB de JS en el navegador), scripts con `defer`, fuentes con `display=swap`, imágenes con `width/height` y `loading="lazy"`, compresión gzip.

**Importante:** el contenido se genera con JavaScript. Google lo ejecuta, pero otros buscadores y vistas previas de redes sociales no. Para posicionar cada propiedad como página propia, el siguiente paso sería renderizar en el servidor (SSR) con una URL real por propiedad.

Cuando tengas dominio propio:

```bash
npm run set-url -- https://www.tudominio.com   # canonical, Open Graph, JSON-LD, robots, sitemap
SITE_URL=https://www.tudominio.com npm start    # el backend usa el mismo valor
```

## Base de datos (PostgreSQL)

Con la variable `DATABASE_URL` definida, el servidor se conecta a PostgreSQL al arrancar, crea las tablas que falten y guarda todo lo que crean los usuarios (propiedades publicadas, ofertas, mensajes, perfil de roommate, puntos y cuenta activa del Holding). Sin `DATABASE_URL` todo queda en memoria, como en local y en las pruebas.

- Código: `backend/services/db.js`. Las lecturas salen de memoria y cada cambio se escribe en la BD, así que la app debe correr en **una sola instancia**.
- Los datos de ejemplo (`backend/data/*.json`) se siguen cargando desde los archivos; la BD guarda solo lo nuevo.
- `GET /api/health` indica `"database": "postgres"` o `"memoria"`.
- `npm test` incluye `db.test.js`, que simula un reinicio con PostgreSQL en memoria (`pg-mem`).

## Despliegue en Railway

1. Sube el repositorio a GitHub y en Railway crea un proyecto **Deploy from GitHub repo**.
2. En el servicio de la app, **Settings → Root Directory** = `alquilapty` (el `railway.json` de esa carpeta define arranque y healthcheck).
3. Añade una base de datos: **+ New → Database → PostgreSQL**.
4. En **Variables** del servicio de la app añade `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
5. **Settings → Networking → Generate Domain**. `SITE_URL` toma ese dominio automáticamente (o defínela tú).

## Otros despliegues

El backend necesita un servidor Node (Render, Railway, Fly.io, un VPS…): **GitHub Pages no puede ejecutarlo**.

- **Todo en un servicio** (lo más simple): despliega este repositorio con `npm start`. El mismo servidor entrega el frontend y la API.
- **Frontend y backend separados**: sube `frontend/` a un hosting estático, despliega el backend aparte y
  1. en `frontend/index.html` cambia `<meta name="api-base" content="https://tu-api.com/api">`;
  2. en el backend define `CORS_ORIGIN=https://tu-frontend.com`.

Variables de entorno: `PORT`, `CORS_ORIGIN`, `SITE_URL`, `DATABASE_URL` (opcional), `PGSSL` (`true`/`false` para forzar SSL).

## Si editas el diseño

Tailwind genera solo las clases que encuentra escritas en `frontend/**/*.{html,js}`. Tras añadir clases nuevas ejecuta:

```bash
npm run build:css
```

Escribe las clases completas (`bg-red-500`), no las construyas con variables (`bg-${color}-500`), porque no se detectarían.

## Limitaciones conocidas (es una demo)

- **Sin `DATABASE_URL` los datos viven en memoria** y se pierden al reiniciar (ver "Base de datos").
- **El simulador de planes** (cabecera `X-Demo-Plan`, sin sesión) sigue activo para la demo y cualquiera puede usarlo con las cuentas demo. En producción habría que desactivarlo y exigir sesión.
- **Los pagos son simulados**: no hay pasarela real (Stripe, etc.).
- **El asistente funciona con reglas**, no con un modelo de lenguaje. El punto de conexión está aislado en `backend/services/assistant.service.js`.
- Los anuncios, precios y reseñas son de ejemplo.
