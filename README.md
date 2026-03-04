# Caras CRM Frontend

Microfrontend del modulo **Caras Fracturadas ASTM D5821-13** para Geofal.

- Dominio productivo: `https://caras.geofal.com.pe`
- Backend API: `https://api.geofal.com.pe` (rutas `/api/caras`)

## Objetivo

- Registrar y editar ensayos de porcentaje de particulas fracturadas.
- Mantener guardado incremental en BD (`EN PROCESO`/`COMPLETO`).
- Exportar Excel con plantilla oficial `Template_Caras.xlsx`.
- Cerrar modal del CRM luego de guardar.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Axios
- React Hot Toast

## Variables de entorno

- `VITE_API_URL=https://api.geofal.com.pe`
- `VITE_CRM_LOGIN_URL=https://crm.geofal.com.pe/login`

## Desarrollo local

```bash
npm install
npm run dev
```
