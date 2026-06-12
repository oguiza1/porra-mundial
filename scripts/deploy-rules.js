'use strict';
// ============================================================
// Despliega firestore.rules vía API de Firebase Rules
// (la cuenta de servicio no tiene permiso para el flujo
// completo de `firebase deploy`, pero sí para esta API).
// ============================================================

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const PROJECT = 'porra-mundial-8f63e';
const RULES   = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

async function run() {
  const auth = new GoogleAuth({
    scopes:      ['https://www.googleapis.com/auth/cloud-platform'],
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
  });
  const client = await auth.getClient();
  const base   = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;

  // 1. Crear el ruleset con el contenido de firestore.rules
  const rs = await client.request({
    url:    `${base}/rulesets`,
    method: 'POST',
    data:   { source: { files: [{ name: 'firestore.rules', content: RULES }] } },
  });
  console.log('Ruleset creado:', rs.data.name);

  // 2. Apuntar la release de Firestore al nuevo ruleset
  await client.request({
    url:    `${base}/releases/cloud.firestore`,
    method: 'PATCH',
    data:   {
      release: {
        name:        `projects/${PROJECT}/releases/cloud.firestore`,
        rulesetName: rs.data.name,
      },
    },
  });
  console.log('Reglas de Firestore desplegadas ✓');
}

run().catch(err => {
  console.error('Error:', err.response?.data?.error?.message || err.message);
  process.exit(1);
});
