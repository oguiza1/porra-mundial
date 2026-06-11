'use strict';
// ============================================================
// SCRIPT DE RECORDATORIOS — Porra Mundial 2026
// Ejecutado por GitHub Actions cada 30 minutos.
// Envía notificaciones push a usuarios sin porra cuando
// un partido empieza en ~1 hora.
// ============================================================

const admin = require('firebase-admin');

// Inicializar Firebase Admin con la cuenta de servicio (GitHub Secret)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db        = admin.firestore();
const messaging = admin.messaging();

// URL de la app (configurar como GitHub Secret o variable de entorno)
const APP_URL = process.env.APP_URL || 'https://oguiza1.github.io/porra-mundial/';

// ── Partidos base (mismos que js/data.js) ─────────────────
// Generado por generate-data.py. Cuando el admin añade más
// partidos desde la app, el script también los lee de Firestore.
const BASE_MATCHES = require('./matches.json').matches;

async function run() {
  const now    = new Date();
  // Ventana: partidos que empiezan entre 45 y 75 minutos desde ahora
  // El cron corre cada 30 min → cada partido cae en la ventana exactamente una vez
  const winMin = new Date(now.getTime() + 45 * 60 * 1000);
  const winMax = new Date(now.getTime() + 75 * 60 * 1000);

  console.log(`[${now.toISOString()}] Buscando partidos entre ${winMin.toISOString()} y ${winMax.toISOString()}`);

  const groupsSnap = await db.collection('groups').get();
  if (groupsSnap.empty) { console.log('No hay grupos.'); return; }

  for (const groupDoc of groupsSnap.docs) {
    const groupId   = groupDoc.id;
    const groupName = groupDoc.data().name || groupId;

    // Partidos añadidos por el admin desde la app
    const extraSnap   = await db.collection('groups').doc(groupId).collection('matches').get();
    const extraMatches = extraSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Partidos ya finalizados
    const resSnap  = await db.collection('groups').doc(groupId).collection('results').get();
    const finished = new Set(resSnap.docs.map(d => d.id));

    // Filtrar partidos en la ventana horaria
    const targets = [...BASE_MATCHES, ...extraMatches].filter(m => {
      const d = new Date(m.date);
      return d >= winMin && d <= winMax && !finished.has(m.id);
    });

    if (!targets.length) continue;
    console.log(`Grupo "${groupName}": ${targets.length} partido(s) próximos en ~1h`);

    // Obtener miembros del grupo
    const membersSnap = await db.collection('groups').doc(groupId).collection('members').get();

    for (const memberDoc of membersSnap.docs) {
      const uid = memberDoc.id;

      for (const match of targets) {
        // ── Anti-duplicados: ¿ya enviamos notificación para este partido+usuario?
        const flagRef = db.collection('groups').doc(groupId)
          .collection('notifSent').doc(`${uid}_${match.id}`);
        const flagDoc = await flagRef.get();
        if (flagDoc.exists) continue;

        // ── ¿El usuario ya tiene porra? Si la tiene, no notificar
        const predRef = db.collection('groups').doc(groupId)
          .collection('predictions').doc(`${uid}_${match.id}`);
        const predDoc = await predRef.get();
        if (predDoc.exists) {
          // Marcar igualmente para no revisar de nuevo
          await flagRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), skipped: true });
          continue;
        }

        // ── Obtener token FCM del usuario
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) continue;
        const fcmToken = userSnap.data().fcmToken;
        if (!fcmToken) continue;

        const label = `${match.home} vs ${match.away}`;
        console.log(`  → Recordatorio a ${userSnap.data().displayName || uid} sobre "${label}"`);

        try {
          await messaging.send({
            token: fcmToken,
            notification: {
              title: '⏰ ¡1 hora para poner la porra!',
              body:  `${label} empieza en 1 hora. ¡No te quedes sin tu predicción!`,
            },
            webpush: {
              notification: {
                requireInteraction: true,
                vibrate:            [200, 100, 200],
              },
              fcmOptions: { link: APP_URL },
            },
            data: { matchId: match.id },
          });

          // Marcar como enviado
          await flagRef.set({
            sentAt:  admin.firestore.FieldValue.serverTimestamp(),
            matchId: match.id,
            uid,
            skipped: false,
          });
          console.log(`  ✓ Enviado`);

        } catch (err) {
          if (err.code === 'messaging/registration-token-not-registered') {
            // Token caducado → eliminar del usuario
            await db.collection('users').doc(uid).update({
              fcmToken: admin.firestore.FieldValue.delete(),
            });
            console.log(`  ✗ Token caducado para ${uid}, eliminado.`);
          } else {
            console.error(`  ✗ Error para ${uid}:`, err.message);
          }
        }
      }
    }
  }

  // ── Limpiar flags de más de 14 días
  try {
    const cutoff  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oldSnap = await db.collectionGroup('notifSent')
      .where('sentAt', '<', cutoff).limit(100).get();
    if (!oldSnap.empty) {
      const batch = db.batch();
      oldSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`Limpiados ${oldSnap.size} flags antiguos.`);
    }
  } catch (_) { /* collectionGroup puede no estar indexado todavía */ }

  console.log('Proceso completado.');
}

run().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
