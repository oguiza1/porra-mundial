'use strict';
// ============================================================
// AVISO ÚNICO — Porra del Campeón
// Envía una notificación push a todos los usuarios con token FCM
// anunciando la nueva porra de "¿quién ganará el Mundial?".
// Se lanza a mano desde GitHub Actions (workflow_dispatch).
// ============================================================

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db        = admin.firestore();
const messaging = admin.messaging();
const APP_URL   = process.env.APP_URL || 'https://oguiza1.github.io/porra-mundial/';

async function run() {
  const usersSnap = await db.collection('users').get();
  let sent = 0, removed = 0;

  for (const userDoc of usersSnap.docs) {
    const token = userDoc.data().fcmToken;
    if (!token) continue;
    try {
      await messaging.send({
        token,
        notification: {
          title: '🏆 ¡Nueva porra del Mundial!',
          body:  'Apuesta por quién ganará el Mundial: 12 pts si aciertas el campeón, 4 si aciertas un finalista. ¡Tienes 72h!',
        },
        webpush: {
          notification: { requireInteraction: true, vibrate: [200, 100, 200] },
          fcmOptions:   { link: APP_URL },
        },
        data: { type: 'champion-bet' },
      });
      sent++;
    } catch (err) {
      if (err.code === 'messaging/registration-token-not-registered') {
        await db.collection('users').doc(userDoc.id).update({
          fcmToken: admin.firestore.FieldValue.delete(),
        });
        removed++;
      } else {
        console.error(`Error con ${userDoc.id}:`, err.message);
      }
    }
  }
  console.log(`Avisos enviados: ${sent}. Tokens caducados eliminados: ${removed}.`);
}

run().catch(err => { console.error('Error fatal:', err); process.exit(1); });
