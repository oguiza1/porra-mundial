# Porra Mundial 2026 🏆

App web para hacer porras del Mundial 2026 con amigos. Funciona como PWA (instalable en el móvil).

## Sistema de puntos

| Resultado | Puntos |
|-----------|--------|
| Resultado exacto (ej: 2-1 y aciertas 2-1) | **+6 pts** |
| Ganador/empate correcto (pero no el marcador) | **+3 pts** |
| Fallo | 0 pts |
| Partido de España + goleador acertado | **+2 pts por cada goleador acertado** (independiente del resultado) |
| Porra Sorpresa activada y predicción correcta | **+3 pts** extra |

### Características extra
- 🔥 **Racha**: Se muestra cuántos aciertos consecutivos llevas
- 🎯 **Porra Sorpresa**: Apuesta especial con +3 pts si aciertas (¡sin penalización si fallas!)
- 📊 **Leaderboard** en tiempo real
- 👥 **Grupos privados** con código de invitación
- ⚙️ **Panel de Admin**: el creador del grupo puede añadir partidos y actualizar resultados

---

## Configuración (5 pasos)

### 1. Crear proyecto Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Haz clic en **"Añadir proyecto"**
3. Nombre: `porra-mundial-2026` (o el que quieras)
4. Desactiva Google Analytics (opcional)
5. Crea el proyecto

### 2. Habilitar Authentication

1. En el panel izquierdo: **Authentication → Comenzar**
2. Pestaña **"Sign-in method"**
3. Habilitar **Google**
4. Pon tu email como "correo electrónico de asistencia del proyecto"
5. Guarda

### 3. Crear base de datos Firestore

1. En el panel izquierdo: **Firestore Database → Crear base de datos**
2. Modo: **Producción**
3. Región: `europe-west1` (para menor latencia desde España)
4. Una vez creada, ve a la pestaña **"Reglas"** y pega el contenido de `firestore.rules`
5. Publica las reglas

### 4. Obtener la configuración de la app

1. En Firebase: **Configuración del proyecto** (⚙️) → **"Tus apps"**
2. Haz clic en **"</>** (Web)"
3. Nombre de la app: `Porra Mundial`
4. **No** actives Firebase Hosting (usaremos GitHub Pages)
5. Copia el objeto `firebaseConfig` y pégalo en `js/config.js`

### 5. Activar notificaciones push (recordatorios 1h antes)

#### 5a. Obtener la clave VAPID
1. Firebase Console → **Configuración del proyecto** → pestaña **Cloud Messaging**
2. Sección **Certificados push web** → **Generar par de claves**
3. Copia la **Clave pública** y pégala en `js/config.js` (`VAPID_KEY`)
4. Copia también la misma `FIREBASE_CONFIG` en `sw.js` (hay un comentario indicándolo)

#### 5b. Obtener la cuenta de servicio (para GitHub Actions)
1. Firebase Console → **Configuración del proyecto** → pestaña **Cuentas de servicio**
2. Haz clic en **Generar nueva clave privada** → descarga el JSON
3. En GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Nombre: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: pega todo el contenido del JSON descargado
4. Añade otro secret:
   - Nombre: `APP_URL`
   - Valor: `https://TU_USUARIO.github.io/porra-mundial/`

#### ¿Cómo funcionan los recordatorios?
- GitHub Actions ejecuta `scripts/check-and-notify.js` cada 30 minutos (gratis)
- El script busca partidos que empiecen en ~1 hora
- Si un miembro no tiene porra, le envía una notificación push al móvil
- Si ya tiene porra o ya se le notificó, no se envía nada

### 6. Publicar en GitHub Pages

```bash
# 1. Crea un repo en github.com (puede ser público o privado)
# 2. Sube los archivos:
git init
git add .
git commit -m "Porra Mundial 2026"
git remote add origin https://github.com/TU_USUARIO/porra-mundial.git
git push -u origin main

# 3. En GitHub → Settings → Pages → Branch: main / root → Save
# 4. Tu app estará en: https://TU_USUARIO.github.io/porra-mundial
```

### Configurar dominio autorizado en Firebase

En Firebase → Authentication → Settings → **Dominios autorizados**, añade:
```
TU_USUARIO.github.io
```

---

## Uso

1. Abre la URL de GitHub Pages en el móvil
2. Instálala como PWA: **"Añadir a pantalla de inicio"**
3. El primero que entra crea el grupo y comparte el código de 6 letras
4. Los demás se unen con ese código
5. El **Admin** (creador del grupo) puede:
   - Añadir más partidos desde el Panel Admin
   - Actualizar resultados tras cada partido (los puntos se calculan automáticamente)

---

## Estructura del proyecto

```
porra-mundial/
├── index.html          # App completa (SPA)
├── manifest.json       # PWA manifest
├── .nojekyll           # Para GitHub Pages
├── css/
│   └── style.css       # Estilos
├── js/
│   ├── config.js       # ⚠️ CONFIGURA ESTO con Firebase
│   ├── data.js         # Partidos de España + plantilla
│   └── app.js          # Lógica de la app
└── firestore.rules     # Reglas de seguridad Firestore
```

---

## Preguntas frecuentes

**¿Puedo cambiar los jugadores de España?**
Sí, edita el array `SPAIN_SQUAD` en `js/data.js`.

**¿Se pueden añadir partidos de otras selecciones?**
Sí, el Admin puede añadirlos desde el Panel Admin dentro de la app.

**¿Cuánto cuesta?**
Gratis. Firebase Spark (plan gratuito) permite hasta 50.000 lecturas/día, más que suficiente para un grupo de amigos.

**¿Funciona sin internet?**
Parcialmente: la app carga pero necesita conexión para leer/escribir datos.
