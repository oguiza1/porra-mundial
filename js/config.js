// ============================================================
// CONFIGURACIÓN DE FIREBASE
// Sigue el README.md para obtener estos valores desde:
// https://console.firebase.google.com
// ============================================================
export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC2HnE4uUCKKPh0fOudH9m0NZP34YQt09M",
  authDomain:        "porra-mundial-8f63e.firebaseapp.com",
  projectId:         "porra-mundial-8f63e",
  storageBucket:     "porra-mundial-8f63e.firebasestorage.app",
  messagingSenderId: "602321830220",
  appId:             "1:602321830220:web:c5c62592e8875e3fdf4fe9",
};

// Clave VAPID para notificaciones push
// Firebase Console → Configuración del proyecto → Cloud Messaging
// → Certificados push web → Generar par de claves → copiar la clave pública
export const VAPID_KEY = "BOCOqZvU7wNezbK0LubH-lZ5zSvg8-3GHDynWIZPorC8TLVtdxQAhnlQ7e7g0GVFGRuFjQx0mf7lIUffL-qfpcc";

// ⚠️ Recuerda copiar también FIREBASE_CONFIG en sw.js
