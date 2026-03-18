<div align="center">

<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" />

<br /><br />

# Backend — Simulador de Examenes

API REST del simulador de examenes de ingreso universitario.
Autenticacion con JWT, examen por bloques y registro de historial.

</div>

---

## Desarrollo

```bash
npm install
node index.js
```

Disponible en `http://localhost:3001`

## Variables de entorno

| Variable | Descripcion |
|----------|-------------|
| `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME` | Conexion local a PostgreSQL |
| `DATABASE_URL` | Conexion Railway (tiene prioridad) |
| `PORT` | Puerto del servidor (default `3001`) |
| `JWT_SECRET` | Clave para firmar tokens |
| `DEBUG` | `true` → carga todas las preguntas en orden |
