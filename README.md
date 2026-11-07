
# Sistema de Gestión de Biblioteca Personal

## Descripción

Sistema de Gestión de Biblioteca Personal es un proyecto CRUD desarrollado completamente en TypeScript, con **Node.js** en el backend y **Next.js** en el frontend. Entre sus funciones se encuentran:

### Frontend (React/Next.js)

1. **Interfaz de usuario responsiva:**
   - La aplicación se adapta a diferentes tamaños de pantalla (móviles, tabletas, escritorios).

2. **Gestión de estado:**
   - Uso de Context API o Redux para manejar el estado global de la aplicación.

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
   - Endpoint para generar y descargar archivos CSV con la información de la biblioteca personal del usuario.

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

3. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Esto levantará el frontend en `http://localhost:3000`.

### 3. Configurar el backend

1. Accede al directorio del backend:

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

4. Inicia el servidor:

   ```bash
   npm start
   ```

   Esto levantará el backend en `http://localhost:4000`.

### 4. Run backend tests

The automated suite uses synthetic users and a temporary SQLite database. It checks that `backend/library.db` remains unchanged by comparing file hashes; application queries do not use that database. Node.js 22 is required.

```bash
cd backend/
npm test                 # passing regression suite
npm run test:security    # SEC-04 ownership regression probes
```

Review operations require ownership of both the review and its associated book. Foreign, missing, or inconsistent resources return HTTP 404; existing inconsistent reviews are not modified or deleted by these checks.

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
    ├── .env                    # Variables de entorno
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
    ├── hooks/                  # Custom hooks de React
    ├── schemas/                # Validaciones o esquemas de datos
    ├── services/               # Lógica de conexión con la API
    ├── types/                  # Definiciones de tipos de TypeScript
    ├── utils/                  # Funciones de utilidad
    ├── App.tsx                 # Componente principal de la aplicación
    ├── config.json             # Configuraciones específicas de la app
    ├── index.css               # Estilos globales de la aplicación
    ├── main.tsx                # Archivo principal de entrada de React
    ├── nationalities.json      # Archivo JSON con datos de nacionalidades
    ├── vite-env.d.ts           # Definiciones de ambiente para Vite
    ├── .env.local              # Variables de entorno locales
    ├── .eslint.config.js       # Configuración de ESLint
    ├── .gitignore              # Archivos y carpetas ignorados por Git
    ├── index.html              # Archivo HTML principal
    ├── package-lock.json       # Archivo de bloqueo de dependencias
    ├── package.json            # Archivo de configuración de dependencias
    ├── postcss.config.js       # Configuración de PostCSS
    ├── tailwind.config.js      # Configuración de Tailwind CSS
    ├── tsconfig.app.json       # Configuración específica de TypeScript para la app
    ├── tsconfig.json           # Configuración global de TypeScript
    ├── tsconfig.node.json      # Configuración de TypeScript para Node.js
    └── vite.config.ts          # Configuración de Vite
```

## Env

Backend: *.env*

```env
SECRET_KEY=READ_GROUP_CHALLENGE
PORT=4000
```

Frontend: *.env.local*

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Recomendaciones

Este proyecto ya está finalizado y listo para probarse. A continuación, se brindan algunas recomendaciones para garantizar una experiencia óptima durante la prueba:

1. **Probar el backend:**
   - Puedes probar la API RESTful utilizando herramientas como **Postman** o cualquier cliente HTTP de tu preferencia para verificar los endpoints y sus respuestas.

2. **Probar el frontend:**
   - Para una experiencia más realista, se recomienda ejecutar el frontend (Next.js) en **modo producción** siguiendo los pasos indicados más abajo.

3. **Credenciales de prueba:**
   - Puedes iniciar sesión en la aplicación con las siguientes credenciales de prueba:
     - **Correo:** `jama11@gmail.com`
     - **Contraseña:** `123456`

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
