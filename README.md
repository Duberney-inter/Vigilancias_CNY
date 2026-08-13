# Sistema de Vigilancias QR - Colegio Nueva York (CNY)

Este proyecto es una aplicación web híbrida diseñada para el control y seguimiento en tiempo real de las vigilancias y rondas escolares de los descansos de **Snack** y **Lunch** para las secciones de Preescolar y Primaria del Colegio Nueva York. 

El sistema asegura la presencia física de los docentes en las zonas correspondientes mediante la validación georreferenciada (GPS) y el escaneo de códigos QR.

---

## 🚀 Características Principales

1.  **Doble Validación de Asistencia**:
    *   **Escaneo QR**: El docente escanea el código QR físico de la zona.
    *   **Verificación GPS**: Compara la ubicación del dispositivo con las coordenadas configuradas de la zona utilizando la fórmula de Haversine. El docente debe estar a menos de **50 metros** de distancia del punto oficial para registrar la vigilancia.
2.  **Soporte Desconectado (Offline Sync)**:
    *   Si el docente no tiene conexión de red móvil o Wi-Fi, las vigilancias se guardan localmente en el dispositivo. Un servicio de sincronización automática en segundo plano las envía a la base de datos en cuanto se recupera el acceso a internet.
3.  **Gestión de Novedades e Incidencias**:
    *   Registro de anomalías reportadas en las zonas escolares, con opción de adjuntar fotografías (comprimidas y codificadas a Base64).
4.  **Dashboards según Roles**:
    *   **Docente / Jefe de Área**: Escaneo de zonas, reporte de novedades, turnos asignados e historial personal.
    *   **Director**: Panel de KPI institucionales, monitoreo en tiempo real de rondas, envío de comunicados individuales o masivos, analíticas en gráficos y descarga de reportes en CSV.
    *   **Administrador**: ABM de usuarios y zonas geográficas, visualización y descarga en HD de códigos QR, backup/restauración JSON completo y purga con retención mínima de 1 año.

---

## 🛠️ Stack Tecnológico

*   **Frontend**: React (v19), Vite (v6), React Router (v7), SweetAlert2 y Chart.js.
*   **Backend**: Node.js servido en Vercel Serverless Functions (`/api`).
*   **Base de Datos**: 
    *   *Nube/Producción*: PostgreSQL en Neon Database.
    *   *Local/Desarrollo*: PGlite (base de datos en memoria/archivo dentro del proyecto en `./local_pgdata`).

---

## 💻 Desarrollo y Pruebas Locales

### Requisitos Previos
1.  Clonar el repositorio.
2.  Instalar las dependencias locales:
    ```bash
    npm install
    ```
3.  Configurar las variables de entorno en un archivo `.env` en la raíz (puedes basarte en `.env.example`). Para usar la base de datos PostgreSQL local embebida sin requerir Neon:
    ```env
    USE_LOCAL_DB=true
    JWT_SECRET=tu_clave_secreta_local
    ```

### Usuarios de prueba (seed local)
Si usas PGlite con los datos de ejemplo, puedes iniciar sesión con:
- Documento `101` / `102` / `103` / `104` / `105`
- Contraseña `123456`

### Si la base local falla (PGlite)
Cierra el servidor (`Ctrl+C`), borra la carpeta `local_pgdata` y vuelve a ejecutar `npm run dev:all`. Solo ejecute **un** servidor a la vez.

### Arranque en Windows
Si `npm` no se reconoce, asegúrese de tener Node.js instalado y reinicie PowerShell. Si aparece error de scripts deshabilitados:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Ejecutar la Aplicación
Para correr el cliente web y el servidor API local de forma concurrente, ejecuta:
```bash
npm run dev:all
```
*   **Frontend**: `http://localhost:5173`
*   **Servidor API local**: `http://localhost:3001` (los endpoints de Vite bajo `/api` se redirigen a este puerto automáticamente).

---

