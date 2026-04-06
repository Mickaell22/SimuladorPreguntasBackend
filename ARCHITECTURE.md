# Arquitectura del backend

Stack: **Node.js + Express (CommonJS)**. Puerto: `3001`.

---

## Estructura de archivos

```
backend/
  index.js          punto de entrada, middlewares globales, montaje de rutas
  db.js             pool de conexion PostgreSQL
  middleware/
    auth.js         funciones auth, authOpcional, authAdmin
  routes/
    auth.js         registro y login
    examen.js       bloques, preguntas, iniciar examen, verificar
    historial.js    historial paginado y detalle de examen
    perfil.js       consulta y actualizacion de datos del usuario
    admin.js        CRUD de bloques, materias, unidades, temas, preguntas, importacion/exportacion
    debug.js        endpoints de diagnostico (solo en DEBUG=true)
```

---

## Conexion a la base de datos (`db.js`)

`pool` es un `pg.Pool` configurado de forma exclusiva por variables de entorno.

- Si existe `DATABASE_URL`: se usa esa cadena con SSL habilitado (Railway).
- Si no: se usan las variables individuales `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (desarrollo local).

En cada nueva conexion se ejecuta `SET search_path TO simulador`, por lo que todas las queries pueden omitir el schema en tablas del schema `simulador`. Las tablas `bloques`, `materias`, `preguntas`, `examenes`, etc. viven en `simulador`.

No se hardcodean host, puerto, usuario ni contrasena en el codigo.

---

## Middlewares globales (`index.js`)

| Middleware | Descripcion |
|---|---|
| `helmet()` | Headers de seguridad HTTP |
| `cors()` | Permite origenes cruzados |
| `express.json({ limit: '20mb' })` | Parseo de body JSON con limite para imports |
| `loginLimiter` | Rate limit de 20 req / 15 min solo en `/api/login` y `/api/registro` |

`app.set('trust proxy', 1)` esta activo para que el rate limiter funcione correctamente detras del proxy de Railway.

---

## Autenticacion (`middleware/auth.js`)

Tres funciones exportadas que leen el token del header `Authorization: Bearer <token>`:

| Funcion | Comportamiento |
|---|---|
| `auth` | Requiere token valido; falla con 401 si no hay token o es invalido |
| `authOpcional` | Adjunta `req.usuario` si el token es valido, pero no falla si no existe |
| `authAdmin` | Requiere token valido y `rol === 'admin'`; falla con 403 si el rol no coincide |

El payload del JWT contiene `{ id, email, rol }`. El secreto viene de `JWT_SECRET` (variable de entorno obligatoria — el proceso termina con error si no esta definida). Los tokens tienen expiracion de 7 dias.

---

## Rutas

### Auth (`routes/auth.js`)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| POST | `/api/registro` | ninguna | Crea usuario, hashea contrasena con bcryptjs (salt 10), retorna `{ token, usuario }` |
| POST | `/api/login` | ninguna | Verifica cedula + contrasena, retorna `{ token, usuario }` |

Campos requeridos en registro: `nombre`, `apellido`, `email`, `cedula`, `telefono`, `direccion`, `tipo_institucion`, `contrasena`. El campo `cedula` y `email` tienen restriccion `UNIQUE` en la DB (error `23505` → 409).

---

### Examen (`routes/examen.js`)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/bloques` | ninguna | Lista todos los bloques |
| GET | `/api/bloques-info` | ninguna | Bloques con materias, porcentajes, carreras (desde `informacion_bloque`) |
| GET | `/api/examen/unidades` | ninguna | Unidades de una materia con conteo de preguntas. Params: `idBloque`, `idMateria` |
| GET | `/api/examen/iniciar` | ninguna | Selecciona IDs de preguntas. Ver detalle abajo |
| GET | `/api/examen/pregunta/:id` | ninguna | Una pregunta sin `respuesta_correcta` |
| POST | `/api/verificar` | `authOpcional` | Verifica respuestas; guarda examen en DB si hay usuario autenticado |

#### Cache de configuracion del examen

`getExamenBloques()` carga la tabla `informacion_bloque` y la cruza con `materias` para resolver nombres a IDs. El resultado se cachea en memoria (`_examenBloques`). La funcion `invalidarCacheExamen()` se exporta para que `admin.js` la llame al modificar la configuracion de materias.

#### Logica de `/api/examen/iniciar`

Parametros de query disponibles: `idBloque`, `idMateria`, `cantidad`, `idUnidades` (lista separada por coma), `todo`.

```
idMateria ausente
  └─ DEBUG=true + todo=true  → todas las preguntas del bloque en orden (meta incluida)
  └─ normal               → aleatorio por materia segun config del bloque

idMateria presente
  └─ DEBUG=true           → todas las preguntas de la materia en orden (filtra por idUnidades si se pasa)
  └─ normal + idUnidades  → aleatorio limitado a esas unidades, cantidad = param o config
  └─ normal               → aleatorio de la materia completa, cantidad = param o config
```

En modo DEBUG la respuesta incluye `{ ids, total, debug: true, meta }` donde `meta` es un mapa `id → { idMateria, local }`.

#### Logica de `/api/verificar`

1. Recibe `{ respuestas: [{ id, respuesta }], idBloque }`.
2. Consulta todas las preguntas de una sola vez con `ANY($1)`.
3. Calcula correctas y arma el detalle con `justificacion`, `url_justificacion`, materia, unidad y tema de cada pregunta.
4. Puntaje = `correctas * 25`.
5. Si hay `req.usuario` e `idBloque`: inserta en `examenes` y luego inserta todas las `respuestas_examen` en paralelo con `Promise.all`.

---

### Historial (`routes/historial.js`)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/historial` | `auth` | Lista paginada (10 por pagina). Param: `pagina`. Retorna `{ examenes, pagina, totalPaginas, total }` |
| GET | `/api/historial/:id` | `auth` | Detalle completo con `detalle[]` (preguntas, respuestas, materia, unidad, tema). Valida que el examen pertenezca al usuario autenticado |

---

### Perfil (`routes/perfil.js`)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/perfil` | `auth` | Datos personales del usuario (sin hash) |
| PUT | `/api/perfil` | `auth` | Actualiza nombre, apellido, email, telefono, direccion, tipo_institucion |
| PUT | `/api/perfil/contrasena` | `auth` | Cambia contrasena; verifica la actual con bcrypt antes de hashear la nueva |

---

### Admin (`routes/admin.js`)

Todas las rutas de este router requieren `authAdmin` (aplicado con `router.use`).
Montado en `/api/admin`.

#### Recursos CRUD

| Recurso | Rutas |
|---|---|
| Bloques | GET / POST / PUT `:id` / DELETE `:id` |
| Materias por bloque | GET `/bloques/:id/materias` / POST / DELETE `:idMateria` |
| Informacion de bloque | PUT `/bloques/:id/info` (carreras + config_materias) |
| Unidades | GET `/unidades` / POST / PUT `:id` / DELETE `:id` |
| Temas | GET `/temas` / POST / PUT `:id` / DELETE `:id` |
| Preguntas | GET (con filtros) / POST / PUT `:id` / DELETE `:id` |

Eliminar un bloque falla con 409 si tiene preguntas o examenes asociados. Al crear un bloque se inserta automaticamente un registro en `informacion_bloque` en la misma transaccion.

Toda modificacion que afecte la composicion del examen (materias de un bloque, config_materias) llama a `invalidarCacheExamen()`.

#### Importacion y exportacion

| Endpoint | Descripcion |
|---|---|
| POST `/importar-excel` | Recibe `.xlsx` + `.zip` de imagenes via `multipart/form-data`. Usa `xlsx` para leer el archivo y `adm-zip` para extraer imagenes. Inserta preguntas con `UPSERT` por bloque/materia/id_local |
| POST `/importar-xml` | Recibe XML (formato Moodle). Parsea con el modulo `xml2js` integrado |
| GET `/exportar-xml` | Exporta preguntas del bloque indicado en formato XML Moodle |

`multer` usa `memoryStorage` con limite de 100 MB para los uploads.

---

### Debug (`routes/debug.js`)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/debug/status` | ninguna | Retorna `{ active: bool }` indicando si `DEBUG=true` |
| GET | `/api/debug/imagenes` | `authAdmin` | Preguntas con imagen (base64 en `url_imagen` u opciones). Solo si `DEBUG=true` |

---

## Variables de entorno

Toda configuracion sensible o que cambie entre entornos vive en `.env`. No se hardcodean valores en el codigo.

```
# Conexion local
DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME

# Conexion Railway (tiene prioridad sobre las anteriores)
DATABASE_URL

# Servidor
PORT=3001

# Seguridad
JWT_SECRET   # obligatorio — el proceso termina si no esta definido

# Comportamiento
DEBUG=false  # true activa modo debug: todas las preguntas en orden, rutas adicionales
```

---

## Modo DEBUG

Cuando `DEBUG=true`:

- `/api/examen/iniciar` devuelve todas las preguntas en orden (sin aleatoriedad) e incluye `meta` en la respuesta.
- `/api/debug/imagenes` queda disponible para admin.
- Los logs del servidor registran detalle de cada request de examen y verificacion.
- El frontend desactiva `AntiCheat`, activa sidebar navegable y boton Anterior en `Simulacro`.

---

## Reglas de desarrollo

**Sin hardcoding**
Host, puerto, credenciales y secretos siempre en `.env`. Los archivos `.env` no se suben al repositorio.

**CommonJS**
Todo el backend usa `require` / `module.exports`. No mezclar con sintaxis ESM.

**Transacciones**
Operaciones que modifican multiples tablas deben usar `BEGIN` / `COMMIT` / `ROLLBACK` con un cliente obtenido de `pool.connect()`. Siempre liberar el cliente en el bloque `finally`.

**Sin emojis en el codigo**
No usar emojis en identificadores, comentarios, mensajes de error ni strings funcionales.
