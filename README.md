
# ReadStack — Sistema de Gestión de Biblioteca Personal

## Descripción

ReadStack is a multiuser personal library application built with TypeScript, Next.js 14.2.18, React 18, Ant Design 5 and Tailwind CSS 3 on the frontend, and Node.js, Express 4 and SQLite on the backend. It supports public registration and private per-user collections. Modernization and release verification remain in progress.

### Frontend (React/Next.js)

1. **Interfaz de usuario responsiva:**
   - La aplicación se adapta a diferentes tamaños de pantalla (móviles, tabletas, escritorios).

2. **Gestión de estado:**
   - Uso de Context API para manejar el estado global de la aplicación.

3. **Rutas protegidas:**
   - Implementación de autenticación en las rutas para restringir el acceso a usuarios no autenticados.

4. **Manejo de formularios:**
   - Formularios con validaciones personalizadas para:
     - Registro y login de usuarios.
     - Creación, edición y eliminación de libros.

5. **Búsqueda y filtros:**
   - Barra de búsqueda para encontrar libros por título.
   - Filtros avanzados para refinar resultados por:
     - Autor.
     - Año de publicación.
     - Género.

6. **Vista detallada de libros:**
   - Página individual para cada libro con información completa (título, autor, año, géneros, portada, reseñas, etc.).

7. **Favoritos:**
   - Funcionalidad para marcar y desmarcar libros como favoritos.

8. **Dark/Light mode:**
   - Alternancia entre tema claro y oscuro para personalizar la experiencia del usuario.
   - The frontend stores the selected theme in `localStorage` and otherwise uses the initial system preference. A shared provider synchronizes the Tailwind dark class and Ant Design theme; first-paint and overlay behavior still require browser validation.

### Backend (Node.js/Express)

1. **API RESTful:**
   - Desarrollo de una API estructurada para soportar todas las funcionalidades del frontend, incluyendo:
     - CRUD de libros.
     - Autenticación de usuarios.
     - Manejo de reseñas y calificaciones.
     - Exportación de datos.

2. **Autenticación JWT:**
   - Sistema seguro de inicio de sesión y autorización basado en tokens JWT para proteger rutas y recursos.

3. **Conexión a base de datos:**
   - Gestión de datos almacenados en una base de datos para:
     - Usuarios.
     - Libros.
     - Reseñas y calificaciones.

4. **Validaciones y manejo de errores:**
   - Validación de entradas para asegurarse de que los datos cumplen los requisitos.
   - Respuestas claras y detalladas en caso de errores (ejemplo: credenciales incorrectas, datos faltantes).

5. **Exportación a CSV:**
   - Exportación CSV por libro. La exportación de toda la biblioteca aún no está implementada.

## Requisitos previos

Asegúrate de tener instalados los siguientes programas en tu máquina:

- [Node.js](https://nodejs.org/) (v22)
- [npm](https://www.npmjs.com/) (v10)
- [Git](https://git-scm.com/)

## Instalación y uso

Sigue los pasos a continuación para clonar y ejecutar el proyecto.

### 1. Clonar el repositorio

Ejecuta el siguiente comando para clonar el repositorio en tu máquina local:

```bash
git clone https://github.com/JoseAMota11/read-group-challenge.git
cd read-group-challenge
```

### 2. Configurar el frontend

1. Accede al directorio del frontend:

   ```bash
   cd frontend/
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Crea `frontend/.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` y luego inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Esto levantará el frontend en `http://localhost:3000`.

### 3. Configurar el backend

1. En otra terminal, desde la raíz del repositorio, accede al directorio del backend:

   ```bash
   cd backend/
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Genera el build del backend:

   ```bash
   npm run build
   ```

4. Define una clave JWT local fuerte y arranca el servidor en el puerto 4000:

   ```bash
   PORT=4000 SECRET_KEY="$(openssl rand -hex 32)" npm start
   ```

   Esto levantará el backend en `http://localhost:4000`. El backend usa variables del entorno del proceso y no carga `.env` automáticamente. Sin `PORT`, usa el puerto 3000; sin `SECRET_KEY`, el código actual usa una clave de respaldo insegura. No uses esa clave de respaldo ni publiques claves. La base SQLite usa la ruta relativa `library.db`, por lo que debes iniciar el backend desde `backend/`.

### 4. Run backend tests

The automated suite uses synthetic users and a temporary SQLite database. It checks that `backend/library.db` remains unchanged by comparing file hashes; application queries do not use that database. Node.js 22 is required.

```bash
cd backend/
npm test                 # passing regression suite
npm run test:security    # SEC-04 ownership regression probes
```

Review operations require ownership of both the review and its associated book. Foreign, missing, or inconsistent resources return HTTP 404; existing inconsistent reviews are not modified or deleted by these checks.

### Frontend authentication checks

With Node.js 22 and the existing frontend dependencies installed, run `npm test` from `frontend/`. The focused tests use Node's built-in test runner and the existing TypeScript compiler; they do not require a database or a live service. CI integration and browser-level coverage remain pending.

The frontend protects library and book routes as a navigation aid; the API still verifies each token and enforces ownership. An expired or rejected session returns to login. Review edits are saved in browser session storage, scoped to the user and book, so they can be restored after login. A successful submission removes only the submitted version; later edits remain. Drafts expire after 24 hours without editing and are cleaned up when the app opens and approximately hourly while it remains open. If browser storage is unavailable, a draft cannot be restored after navigation.

### Authentication rate limits

Login and registration are limited per normalized email, without storing the email itself in the limiter. By default, login allows 10 requests per account per 15 minutes and registration allows 5 per account per hour, including successful requests. Exceeding a limit returns HTTP 429 with `Retry-After`. Duplicate registration still returns 409 below the limit; it can reveal that an email is registered.

Optional IP limits default to 30 login requests per 15 minutes and 10 registration requests per hour. They are **disabled by default**: set `AUTH_IP_RATE_LIMIT_ENABLED=true` only when the direct socket peer is verified to be the actual client. Express does not trust proxy headers, and this code does not configure a trusted proxy. Render's ingress and forwarded-header behavior are not verified; enabling the IP limiter behind a shared proxy could block unrelated users. Before using per-client IP limiting on Render, verify its ingress topology, header sanitization and direct-access paths, then implement and validate a narrowly trusted client-IP strategy. Do not blindly trust forwarded headers.

Each endpoint's window and limits can be configured with positive integer environment variables: `AUTH_LOGIN_WINDOW_MS`, `AUTH_LOGIN_ACCOUNT_MAX`, `AUTH_LOGIN_IP_MAX`, `AUTH_REGISTER_WINDOW_MS`, `AUTH_REGISTER_ACCOUNT_MAX`, and `AUTH_REGISTER_IP_MAX`. Window values are milliseconds. Invalid values prevent startup.

The default in-memory stores are process-local: counters reset on restart and are not shared across instances. Account limits can temporarily block a targeted user, and case variants share a limit even though existing authentication remains case-sensitive. IP limits are needed to help limit attempts across many accounts; until a safe Render client-IP strategy is verified, this protection is incomplete. The in-memory store is not capped against many distinct identifiers. No external service is required.

## Estructura del proyecto

```plaintext
read-group-challenge/
  backend/
    ├── dist/                   # Archivos generados tras la compilación
    ├── node_modules/           # Dependencias instaladas del proyecto
    ├── src/                    # Código fuente principal
    │   ├── config/             # Configuraciones de la aplicación (ej: DB, variables)
    │   ├── controllers/        # Controladores que manejan la lógica del negocio
    │   ├── middlewares/        # Middlewares para la app
    │   ├── models/             # Definición de modelos de datos
    │   ├── routes/             # Rutas y su conexión con controladores
    │   ├── types/              # Definiciones de tipos de TypeScript
    │   └── utils/              # Funciones de utilidad compartidas
    │   └── index.ts            # Punto de entrada principal del backend
    ├── .gitignore              # Archivos y carpetas ignorados por Git
    ├── library.db              # Archivo de base de datos SQLite
    ├── package-lock.json       # Archivo de bloqueo de dependencias
    ├── package.json            # Archivo de configuración de dependencias
    └── tsconfig.json           # Configuración de TypeScript
  frontend/
    ├── node_modules/           # Dependencias instaladas del proyecto
    ├── app/                    # Carpetas relacionadas a rutas o páginas principales
    ├── components/             # Componentes reutilizables de React
    ├── context/                # Configuración de contextos globales
    ├── schemas/                # Validaciones o esquemas de datos
    ├── services/               # Lógica de conexión con la API
    ├── types/                  # Definiciones de tipos de TypeScript
    ├── utils/                  # Funciones de utilidad
    ├── middleware.ts           # Protección de rutas
    ├── .env.local              # Variables de entorno locales
    ├── .eslintrc.json           # Configuración de ESLint
    ├── .gitignore              # Archivos y carpetas ignorados por Git
    ├── package-lock.json       # Archivo de bloqueo de dependencias
    ├── package.json            # Archivo de configuración de dependencias
    ├── postcss.config.mjs      # Configuración de PostCSS
    ├── tailwind.config.ts      # Configuración de Tailwind CSS
    ├── tsconfig.json           # Configuración global de TypeScript
    └── next.config.mjs         # Configuración de Next.js
```

## Env

See [Environment governance](docs/ENVIRONMENT_GOVERNANCE.md) for the variable inventory and approved secret policy; `SEC-01` will implement the new JWT policy later.

Backend: environment variables supplied to the process (see startup command above):

```env
SECRET_KEY=<strong-local-secret>
PORT=4000
```

Frontend: *.env.local*

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Recomendaciones

El proyecto sigue en modernización. Estas recomendaciones sirven para pruebas locales, no como aprobación de producción:

1. **Probar el backend:**
   - Puedes probar la API RESTful utilizando herramientas como **Postman** o cualquier cliente HTTP de tu preferencia para verificar los endpoints y sus respuestas.

2. **Probar el frontend:**
   - Para una experiencia más realista, se recomienda ejecutar el frontend (Next.js) en **modo producción** siguiendo los pasos indicados más abajo.

3. **Cuenta de prueba:**
   - Registra una cuenta sintética para las pruebas locales; no uses datos de producción.

### Pasos para ejecutar el frontend (Next.js) en modo producción

1. **Asegúrate de tener instaladas las dependencias**
   - Si no lo has hecho antes, instala las dependencias del proyecto usando **npm** o **yarn**:

     ```bash
     npm install
     ```

     o

     ```bash
     yarn install
     ```

2. **Genera el build de producción**
   - Usa el comando `build` para generar los archivos optimizados para producción:

     ```bash
     npm run build
     ```

     o

     ```bash
     yarn build
     ```

3. **Ejecuta el servidor en modo producción**
   - Una vez generado el build, inicia el servidor de producción con:

     ```bash
     npm run start
     ```

     o

     ```bash
     yarn start
     ```

4. **Accede a la aplicación**
   - Abre tu navegador y ve a [http://localhost:3000](http://localhost:3000) para probar la aplicación en modo producción.

---

**Autor:** José A. Mota  
[Repositorio del proyecto](https://github.com/JoseAMota11/read-group-challenge)
