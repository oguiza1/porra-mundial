'use strict';
// ============================================================
// RESULTADOS EN DIRECTO — Porra Mundial 2026
// Ejecutado por GitHub Actions cada ~5 minutos.
// Lee el marcador de la API pública de ESPN y actualiza
// Firestore: marcadores en vivo, resultados finales, goleadores
// de España y recálculo de puntos de todos los grupos.
// ============================================================

const admin = require('firebase-admin');
const { matches: ALL_MATCHES } = require('./matches.json');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const KNOWN_IDS  = new Set(ALL_MATCHES.map(m => m.id));
const BASE_BY_ID = Object.fromEntries(ALL_MATCHES.map(m => [m.id, m]));

// Plantilla de España (mismos nombres que js/data.js — las
// porras de goleadores se comparan por este nombre exacto)
const SPAIN_SQUAD = [
  'Unai Simón', 'David Raya', 'Álex Remiro',
  'Carvajal', 'Laporte', 'Le Normand', 'Grimaldo', 'Cucurella', 'Pedro Porro', 'Nacho',
  'Rodri', 'Pedri', 'Fabián Ruiz', 'Zubimendi', 'Merino', 'Gavi',
  'Lamine Yamal', 'Nico Williams', 'Dani Olmo', 'Ferran Torres', 'Álvaro Morata',
  'Mikel Oyarzabal', 'Bryan Zaragoza', 'Joselu',
];

// Nombre ESPN → (nombre español, bandera). Para actualizar los
// cruces de eliminatorias cuando se conocen los equipos.
const TEAMS = {
  'Mexico': ['México', '🇲🇽'], 'Czechia': ['Chequia', '🇨🇿'], 'South Korea': ['Corea del Sur', '🇰🇷'],
  'South Africa': ['Sudáfrica', '🇿🇦'], 'Canada': ['Canadá', '🇨🇦'], 'Bosnia-Herzegovina': ['Bosnia', '🇧🇦'],
  'Switzerland': ['Suiza', '🇨🇭'], 'Qatar': ['Catar', '🇶🇦'], 'Brazil': ['Brasil', '🇧🇷'],
  'Scotland': ['Escocia', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], 'Haiti': ['Haití', '🇭🇹'], 'Morocco': ['Marruecos', '🇲🇦'],
  'Paraguay': ['Paraguay', '🇵🇾'], 'Türkiye': ['Turquía', '🇹🇷'], 'Australia': ['Australia', '🇦🇺'],
  'United States': ['Estados Unidos', '🇺🇸'], 'Ecuador': ['Ecuador', '🇪🇨'], 'Germany': ['Alemania', '🇩🇪'],
  'Ivory Coast': ['Costa de Marfil', '🇨🇮'], 'Curaçao': ['Curazao', '🇨🇼'], 'Netherlands': ['Países Bajos', '🇳🇱'],
  'Sweden': ['Suecia', '🇸🇪'], 'Japan': ['Japón', '🇯🇵'], 'Tunisia': ['Túnez', '🇹🇳'],
  'Belgium': ['Bélgica', '🇧🇪'], 'Iran': ['Irán', '🇮🇷'], 'Egypt': ['Egipto', '🇪🇬'],
  'New Zealand': ['Nueva Zelanda', '🇳🇿'], 'Spain': ['España', '🇪🇸'], 'Uruguay': ['Uruguay', '🇺🇾'],
  'Saudi Arabia': ['Arabia Saudí', '🇸🇦'], 'Cape Verde': ['Cabo Verde', '🇨🇻'], 'Norway': ['Noruega', '🇳🇴'],
  'France': ['Francia', '🇫🇷'], 'Senegal': ['Senegal', '🇸🇳'], 'Iraq': ['Irak', '🇮🇶'],
  'Argentina': ['Argentina', '🇦🇷'], 'Austria': ['Austria', '🇦🇹'], 'Algeria': ['Argelia', '🇩🇿'],
  'Jordan': ['Jordania', '🇯🇴'], 'Colombia': ['Colombia', '🇨🇴'], 'Portugal': ['Portugal', '🇵🇹'],
  'Uzbekistan': ['Uzbekistán', '🇺🇿'], 'Congo DR': ['RD Congo', '🇨🇩'], 'England': ['Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
  'Croatia': ['Croacia', '🇭🇷'], 'Panama': ['Panamá', '🇵🇦'], 'Ghana': ['Ghana', '🇬🇭'],
};

// ── Helpers ───────────────────────────────────────────────
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mapea el nombre ESPN de un jugador al nombre de la plantilla
function toSquadName(espnName) {
  const n = norm(espnName);
  const nTokens = n.split(/\s+/);
  for (const squad of SPAIN_SQUAD) {
    const s = norm(squad);
    if (n === s || n.includes(s)) return squad;
    // todas las palabras del nombre de plantilla aparecen en el nombre ESPN
    if (s.split(/\s+/).every(tok => nTokens.includes(tok))) return squad;
  }
  return espnName; // sin equivalencia: se guarda tal cual (no puntúa)
}

function yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Misma lógica de puntos que js/app.js → calculatePoints()
function calculatePoints(pred, match) {
  if (match.homeScore === null || match.awayScore === null) return null;
  const outcome = (h, a) => (h > a ? 'H' : a > h ? 'A' : 'D');
  const exact   = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;

  let pts = 0;
  if (exact) pts = 6;
  else if (outcome(pred.homeScore, pred.awayScore) === outcome(match.homeScore, match.awayScore)) pts = 3;

  if (match.isSpainMatch && pred.goalscorers?.length > 0) {
    const predNames   = pred.goalscorers.map(g => (typeof g === 'string' ? g : g.name));
    const actualNames = (match.goalscorers || []).map(g => (typeof g === 'string' ? g : g.name));
    pts += predNames.filter(n => actualNames.includes(n)).length * 2;
  }
  if (pred.surprisePick && pts > 0) pts += 3;
  return pts;
}

async function recalculateMemberPoints(groupId) {
  const membersSnap = await db.collection('groups').doc(groupId).collection('members').get();
  const batch = db.batch();

  for (const memberDoc of membersSnap.docs) {
    const predsSnap = await db.collection('groups').doc(groupId)
      .collection('predictions').where('uid', '==', memberDoc.id).get();

    let totalPoints = 0, correct = 0, predictions = 0, streak = 0;
    const preds = predsSnap.docs.map(d => d.data()).filter(p => p.points !== null && p.points !== undefined);
    preds.sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));

    for (const p of preds) {
      predictions++;
      totalPoints += p.points || 0;
      if (p.points > 0) { correct++; streak++; }
      else streak = 0;
    }
    batch.update(memberDoc.ref, { totalPoints, correct, predictions, streak });
  }
  await batch.commit();
}

// ── Main ──────────────────────────────────────────────────
async function run() {
  const now = new Date();

  // Fuera del torneo no hay nada que hacer
  if (now < new Date('2026-06-10') || now > new Date('2026-07-21')) {
    console.log('Fuera de las fechas del Mundial. Nada que hacer.');
    return;
  }

  // Calendario completo del torneo en una sola petición
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  console.log('Consultando ESPN:', url);
  const sb = await (await fetch(url)).json();
  const events = (sb.events || []).filter(e => KNOWN_IDS.has(e.id));
  console.log(`${events.length} partido(s) en el calendario.`);

  // Recopilar actualizaciones de este ciclo: partidos en juego o
  // terminados en las últimas 48h (los más antiguos ya se procesaron)
  const updates = []; // { matchId, data, finished }
  for (const e of events) {
    const c     = e.competitions[0];
    const state = c.status?.type?.state; // pre | in | post
    if (state !== 'in' && state !== 'post') continue;
    if (state === 'post' && now - new Date(e.date) > 48 * 60 * 60 * 1000) continue;

    const home = c.competitors.find(t => t.homeAway === 'home');
    const away = c.competitors.find(t => t.homeAway === 'away');
    const data = {
      homeScore: parseInt(home.score, 10) || 0,
      awayScore: parseInt(away.score, 10) || 0,
      status:    state === 'post' ? 'finished' : 'live',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Goleadores: en cualquier partido donde juegue España
    const spainTeam = [home, away].find(t => t.team.displayName === 'Spain');
    if (spainTeam) {
      const scorers = {};
      for (const det of c.details || []) {
        if (!det.scoringPlay) continue;
        if (String(det.team?.id) !== String(spainTeam.team.id)) continue;
        if (/own goal/i.test(det.type?.text || '')) continue;
        for (const ath of det.athletesInvolved || []) {
          const name = toSquadName(ath.displayName);
          scorers[name] = (scorers[name] || 0) + 1;
        }
      }
      data.goalscorers = Object.entries(scorers).map(([name, goals]) => ({ name, goals }));
    }

    updates.push({ matchId: e.id, data, finished: state === 'post', isSpainMatch: !!spainTeam });
    console.log(`  ${e.shortName}: ${data.homeScore}-${data.awayScore} (${data.status})` +
      (data.goalscorers ? ` goleadores: ${JSON.stringify(data.goalscorers)}` : ''));
  }

  // Cruces de eliminatorias: cuando ESPN ya conoce los equipos,
  // actualizar nombres/banderas (la app fusiona estos campos)
  const nameUpdates = [];
  for (const e of events) {
    const base = BASE_BY_ID[e.id];
    if (!base || base.phase === 'group') continue;
    const c    = e.competitions[0];
    const home = c.competitors.find(t => t.homeAway === 'home');
    const away = c.competitors.find(t => t.homeAway === 'away');
    const h = TEAMS[home.team.displayName];
    const a = TEAMS[away.team.displayName];
    // ESPN puede conocer solo uno de los dos equipos del cruce
    const data = {};
    if (h && base.home !== h[0]) { data.home = h[0]; data.homeFlag = h[1]; }
    if (a && base.away !== a[0]) { data.away = a[0]; data.awayFlag = a[1]; }
    if (Object.keys(data).length) {
      nameUpdates.push({ matchId: e.id, data });
      console.log(`  Cruce definido: ${data.home || base.home} vs ${data.away || base.away} (${e.id})`);
    }
  }

  if (!updates.length && !nameUpdates.length) { console.log('Sin cambios.'); return; }

  // Aplicar a todos los grupos
  const groupsSnap = await db.collection('groups').get();
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    const resCol  = db.collection('groups').doc(groupId).collection('results');

    for (const { matchId, data } of nameUpdates) {
      const cur = (await resCol.doc(matchId).get()).data() || {};
      if (Object.entries(data).some(([k, v]) => cur[k] !== v)) {
        await resCol.doc(matchId).set(data, { merge: true });
      }
    }

    let needsRecalc = false;
    for (const { matchId, data, finished, isSpainMatch } of updates) {
      const existing = await resCol.doc(matchId).get();
      if (existing.exists && existing.data().pointsComputed) continue; // ya cerrado y puntuado

      await resCol.doc(matchId).set(data, { merge: true });

      if (finished) {
        // Calcular puntos de todas las porras de este partido
        const matchInfo = {
          homeScore:    data.homeScore,
          awayScore:    data.awayScore,
          goalscorers:  data.goalscorers || [],
          isSpainMatch,
        };
        const predsSnap = await db.collection('groups').doc(groupId)
          .collection('predictions').where('matchId', '==', matchId).get();
        const batch = db.batch();
        predsSnap.docs.forEach(p => batch.update(p.ref, { points: calculatePoints(p.data(), matchInfo) }));
        await batch.commit();
        await resCol.doc(matchId).set({ pointsComputed: true }, { merge: true });
        needsRecalc = true;
        console.log(`  Grupo ${groupId}: puntos calculados para ${predsSnap.size} porra(s) de ${matchId}`);
      }
    }

    if (needsRecalc) await recalculateMemberPoints(groupId);
  }

  console.log('Proceso completado.');
}

run().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
