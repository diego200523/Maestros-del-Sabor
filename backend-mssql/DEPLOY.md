# Guía para publicar "Maestros del Sabor" en internet

Tu proyecto tiene 3 piezas que hay que publicar por separado:

| Pieza | Qué es | Dónde publicarla | Costo aprox. |
|---|---|---|---|
| Frontend | La página que ve el cliente (React) | Vercel o Netlify | Gratis |
| Backend | El servidor (Node/Express + chat en vivo) | Render.com o Railway.app | Gratis (con límites) |
| Base de datos | SQL Server con tus productos/pedidos | Azure SQL Database | Gratis (nivel básico) o unos dólares/mes |

Ahora mismo todo corre en tu computadora (`localhost`). Para que cualquier
persona lo use desde su celular o compu, cada pieza necesita vivir en un
servidor real, encendido las 24 horas — eso es "hosting".

---

## Paso 1 — Base de datos: Azure SQL Database

Como ya usas SQL Server, lo más simple es usar la versión en la nube de
Microsoft (mismo lenguaje, mismos scripts que ya tienes).

1. Ve a **portal.azure.com** y crea una cuenta (piden tarjeta para verificar
   identidad, pero el nivel gratuito/básico no cobra si te mantienes dentro
   del límite).
2. Busca **"Bases de datos SQL"** → **Crear**.
3. Elige un nombre de servidor (ej. `maestros-del-sabor-server`), crea un
   usuario administrador y una contraseña — **guárdalos**, los vas a necesitar.
4. En "Proceso y almacenamiento", elige el nivel **Serverless** o **Basic**
   (el más económico).
5. En "Redes", habilita **"Permitir que los servicios de Azure accedan a
   este servidor"** y agrega tu propia IP para poder conectarte desde SSMS.
6. Cuando termine de crearse, abre **SSMS** y conéctate con el nombre de
   servidor que Azure te da (algo como
   `maestros-del-sabor-server.database.windows.net`) y tu usuario/contraseña.
7. Ejecuta ahí, en orden, los mismos scripts que ya usaste en tu base local:
   `schema.sql` → `actualizacion_chat_y_reset.sql` → `actualizacion_seguridad.sql`.

Anota estos datos para el siguiente paso:
- **Servidor**: `maestros-del-sabor-server.database.windows.net`
- **Usuario / contraseña** que creaste
- **Nombre de la base**: `maestros_del_sabor`

---

## Paso 2 — Backend: Render.com

1. Sube tu carpeta `backend-mssql` a GitHub (si no sabes cómo, dímelo y te
   ayudo paso a paso — se puede hacer directo desde VS Code).
2. Ve a **render.com**, crea una cuenta (puedes usar tu cuenta de GitHub).
3. **New → Web Service** → conecta tu repositorio de GitHub.
4. Configuración:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
5. En la sección **Environment**, agrega estas variables (con tus datos
   reales de Azure del paso 1):

   ```
   DB_SERVER=maestros-del-sabor-server.database.windows.net
   DB_PORT=1433
   DB_NAME=maestros_del_sabor
   DB_USER=tu_usuario_admin_de_azure
   DB_PASSWORD=tu_contraseña_de_azure
   DB_ENCRYPT=true
   PORT=4000
   JWT_SECRET=una_frase_larga_y_aleatoria_distinta_a_la_de_tu_pc
   FRONTEND_URL=https://tu-pagina.vercel.app
   ```

   (el valor de `FRONTEND_URL` lo vas a completar después del Paso 3, cuando
   tengas la URL real de tu frontend publicado)

6. Dale **Deploy**. Cuando termine, Render te da una URL pública, algo como
   `https://maestros-del-sabor-backend.onrender.com` — **guárdala**, la
   necesitas para el Paso 3.

⚠️ **Nota sobre las imágenes subidas**: el plan gratuito de Render borra los
archivos guardados en disco cada vez que el servicio se reinicia o se
actualiza. Las imágenes de productos que subas se perderían con el tiempo.
Para una tienda real, lo ideal es guardar las imágenes en un servicio como
Cloudinary (tiene plan gratuito) en vez del disco del servidor — puedo
ayudarte a hacer ese cambio cuando quieras, es una modificación específica
al middleware de subida de imágenes.

---

## Paso 3 — Frontend: Vercel

1. Sube tu carpeta `Interfaz web Maestros del Sabor` a GitHub (otro
   repositorio, separado del backend).
2. Ve a **vercel.com**, crea una cuenta (con GitHub es lo más simple).
3. **Add New → Project** → selecciona tu repositorio.
4. Vercel detecta que es un proyecto Vite automáticamente. Antes de darle
   "Deploy", abre **Environment Variables** y agrega:

   ```
   VITE_SERVER_URL=https://maestros-del-sabor-backend.onrender.com
   ```

   (la URL real que te dio Render en el Paso 2)

5. Dale **Deploy**. Cuando termine, te da tu URL pública, algo como
   `https://maestros-del-sabor.vercel.app`.

---

## Paso 4 — Conectar las dos URLs entre sí

1. Vuelve a **Render** (tu backend) → Environment → actualiza
   `FRONTEND_URL` con la URL real que te dio Vercel.
2. Guarda — Render va a reiniciar el servicio solo.

Con esto, backend y frontend ya saben encontrarse el uno al otro.

---

## Paso 5 — Crear tu usuario administrador en la base ya publicada

Como la base de datos ahora es otra (la de Azure, no tu SQL Server local),
tienes que volver a:
1. Registrarte normalmente desde la página ya publicada.
2. Desde tu computadora, en la carpeta `backend-mssql`, con el `.env`
   apuntando temporalmente a los datos de Azure (o corriendo el comando en
   Render mismo, si el plan lo permite), corre:
   ```
   npm run create-admin -- tu_correo@ejemplo.com
   ```

---

## Checklist final

- [ ] Base de datos creada en Azure SQL y con los 3 scripts ejecutados
- [ ] Backend publicado en Render, con todas las variables de entorno puestas
- [ ] Frontend publicado en Vercel, con `VITE_SERVER_URL` apuntando al backend
- [ ] `FRONTEND_URL` del backend actualizado con la URL real de Vercel
- [ ] Usuario admin creado en la base de datos publicada
- [ ] Probado: registro, login, catálogo, pedido, chat, panel admin — todo
      desde la URL pública, no desde localhost

---

## ¿Prefieres una alternativa más simple para empezar?

Si por ahora solo quieres que **algunas personas de confianza prueben la
página** (no publicarla al mundo entero todavía), hay una opción mucho más
rápida sin crear cuentas en la nube: **ngrok**. Expone tu `localhost` a
internet temporalmente mientras tu computadora esté prendida y el proyecto
corriendo. No es para dejarlo publicado permanentemente, pero sirve para una
demo rápida en minutos. Avísame si prefieres esa ruta primero.
