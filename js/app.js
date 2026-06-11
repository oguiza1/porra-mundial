// ============================================================
// PORRA MUNDIAL 2026 — App Principal
// ============================================================

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, signInAnonymously, updateProfile,
  signOut, onAuthStateChanged,
}                                  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy,
  getDocs, onSnapshot,
  writeBatch, serverTimestamp,
}                                  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { FIREBASE_CONFIG, VAPID_KEY } from './config.js';
import { BASE_MATCHES, SPAIN_SQUAD, PHASES } from './data.js?v=3';
import {
  getMessaging, getToken, onMessage,
}                                  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js';

// ── Firebase init ─────────────────────────────────────────
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

// ── App State ─────────────────────────────────────────────
let currentUser    = null;   // Firebase User
let userDoc        = null;   // Firestore user profile
let currentGroupId = null;
let groupData      = null;
let allMatches     = [];     // merged: BASE_MATCHES + admin-added + results
let myPredictions  = {};     // { matchId: predictionDoc }
let members        = [];     // [{uid, displayName, photoURL, totalPoints, …}]
let isAdmin        = false;
let selectedGoalscorers = {};    // { playerName: numGoals }
let activeMatchId  = null;
let resSelectedMatchId  = null;
let resSelectedGoalscorers = {}; // { playerName: numGoals }
let unsubFns       = [];     // cleanup functions for listeners
let toastTimeout   = null;

// ── Entry point ───────────────────────────────────────────
onAuthStateChanged(auth, async (fbUser) => {
  if (fbUser) {
    currentUser = fbUser;
    await loadOrCreateUser(fbUser);
  } else {
    currentUser = null;
    userDoc     = null;
    showView('login');
  }
});

// ── Auth ──────────────────────────────────────────────────
let pendingName = null; // nombre escrito en el login, usado al crear el perfil

async function loginWithName() {
  const name = $('input-player-name').value.trim();
  if (!name) { showToast('Escribe tu nombre para entrar', 'error'); return; }
  pendingName = name;
  try {
    const cred = await signInAnonymously(auth);
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    showToast('Error al entrar: ' + err.message, 'error');
  }
}

async function logout() {
  // Con sesión anónima, cerrar sesión destruye la cuenta: no se puede recuperar
  const ok = confirm('⚠️ Si cierras sesión perderás tu cuenta, tus porras y tus puntos para siempre. ¿Seguro?');
  if (!ok) return;
  unsubFns.forEach(fn => fn());
  unsubFns = [];
  currentGroupId = null;
  groupData = null;
  allMatches = [];
  myPredictions = {};
  members = [];
  isAdmin = false;
  await signOut(auth);
  showView('login');
}

function myName() {
  return currentUser?.displayName || userDoc?.displayName || pendingName || 'Jugador';
}

// ── User profile ──────────────────────────────────────────
async function loadOrCreateUser(fbUser) {
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const displayName = fbUser.displayName || pendingName || 'Jugador';
    await setDoc(ref, {
      displayName,
      photoURL:    fbUser.photoURL || '',
      groupId:     null,
      createdAt:   serverTimestamp(),
    });
    userDoc = { displayName, photoURL: fbUser.photoURL || '', groupId: null };
  } else {
    userDoc = snap.data();
  }

  if (userDoc.groupId) {
    currentGroupId = userDoc.groupId;
    await initMainApp();
  } else {
    showView('group-setup');
  }
}

// ── Group Management ──────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createGroup(name) {
  if (!name.trim()) { showToast('Pon un nombre al grupo', 'error'); return; }
  const code  = generateCode();
  const gRef  = doc(collection(db, 'groups'));
  const batch = writeBatch(db);

  batch.set(gRef, {
    name:        name.trim(),
    inviteCode:  code,
    adminUid:    currentUser.uid,
    createdAt:   serverTimestamp(),
  });
  batch.set(doc(db, 'groups', gRef.id, 'members', currentUser.uid), {
    uid:         currentUser.uid,
    displayName: myName(),
    photoURL:    currentUser.photoURL    || '',
    totalPoints: 0,
    correct:     0,
    predictions: 0,
    streak:      0,
    joinedAt:    serverTimestamp(),
  });
  batch.update(doc(db, 'users', currentUser.uid), { groupId: gRef.id });

  await batch.commit();
  currentGroupId = gRef.id;
  userDoc.groupId = gRef.id;
  await initMainApp();
}

async function joinGroup(code) {
  if (!code.trim()) { showToast('Introduce el código', 'error'); return; }
  const q = query(collection(db, 'groups'), where('inviteCode', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) { showToast('Código no encontrado', 'error'); return; }

  const gDoc  = snap.docs[0];
  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', gDoc.id, 'members', currentUser.uid), {
    uid:         currentUser.uid,
    displayName: myName(),
    photoURL:    currentUser.photoURL    || '',
    totalPoints: 0,
    correct:     0,
    predictions: 0,
    streak:      0,
    joinedAt:    serverTimestamp(),
  });
  batch.update(doc(db, 'users', currentUser.uid), { groupId: gDoc.id });
  await batch.commit();

  currentGroupId = gDoc.id;
  userDoc.groupId = gDoc.id;
  await initMainApp();
}

// ── Main App Init ─────────────────────────────────────────
async function initMainApp() {
  // Load group data
  const gSnap = await getDoc(doc(db, 'groups', currentGroupId));
  if (!gSnap.exists()) {
    showToast('Grupo no encontrado', 'error');
    showView('group-setup');
    return;
  }
  groupData = gSnap.data();
  isAdmin   = groupData.adminUid === currentUser.uid;

  showView('main');
  updateHeaderUI();

  // Notificaciones push
  setupNotifications();

  // Set up real-time listeners
  listenMembers();
  listenResults();
  listenMyPredictions();
  listenExtraMatches();
}

function updateHeaderUI() {
  $('header-group-name').textContent = groupData?.name || 'Porra 2026';
  $('header-user-name').textContent  = myName().split(' ')[0];
  const avatar = $('header-avatar');
  if (currentUser.photoURL) {
    avatar.src = currentUser.photoURL;
    avatar.style.display = 'block';
  } else {
    avatar.style.display = 'none';
  }
}

// ── Real-time Listeners ───────────────────────────────────
function listenMembers() {
  const ref = collection(db, 'groups', currentGroupId, 'members');
  const unsub = onSnapshot(query(ref, orderBy('totalPoints', 'desc')), snap => {
    members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderLeaderboard();
    renderGroupPage();
    renderHomeStats();
  });
  unsubFns.push(unsub);
}

let latestResults = {};   // { matchId: resultDoc } — escritos por el admin o el bot de resultados
let extraMatches  = [];   // partidos añadidos por el admin

function rebuildMatches() {
  const base = BASE_MATCHES.map(m => ({ ...m, status: 'upcoming', homeScore: null, awayScore: null, goalscorers: [] }));
  const byId = new Map(base.map(m => [m.id, m]));
  for (const ex of extraMatches) byId.set(ex.id, { ...(byId.get(ex.id) || {}), ...ex });
  allMatches = [...byId.values()]
    .map(m => ({
      ...m,
      ...(latestResults[m.id] || {}),
      status: latestResults[m.id]?.status || m.status || 'upcoming',
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  renderCurrentPage();
}

function listenResults() {
  const ref = collection(db, 'groups', currentGroupId, 'results');
  const unsub = onSnapshot(ref, snap => {
    latestResults = {};
    snap.forEach(d => { latestResults[d.id] = d.data(); });
    rebuildMatches();
  });
  unsubFns.push(unsub);
}

function listenMyPredictions() {
  const ref = collection(db, 'groups', currentGroupId, 'predictions');
  const q   = query(ref, where('uid', '==', currentUser.uid));
  const unsub = onSnapshot(q, snap => {
    myPredictions = {};
    snap.forEach(d => { myPredictions[d.data().matchId] = d.data(); });
    renderCurrentPage();
  });
  unsubFns.push(unsub);
}

function listenExtraMatches() {
  const ref = collection(db, 'groups', currentGroupId, 'matches');
  const unsub = onSnapshot(ref, snap => {
    extraMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rebuildMatches();
  });
  unsubFns.push(unsub);
}

// ── Views & Pages ─────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewId = {
    'login':       'view-login',
    'group-setup': 'view-group-setup',
    'main':        'view-main',
  }[name];
  if (viewId) document.getElementById(viewId).classList.add('active');
}

let currentPage = 'home';
function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  renderCurrentPage();
}

function renderCurrentPage() {
  if (currentPage === 'home')        renderHomePage();
  if (currentPage === 'matches')     renderMatchesPage();
  if (currentPage === 'predictions') renderMyPredictionsPage();
  if (currentPage === 'leaderboard') renderLeaderboard();
  if (currentPage === 'group')       renderGroupPage();
}

// ── Home Page ─────────────────────────────────────────────
function renderHomePage() {
  renderHomeStats();

  // Next match without prediction
  const next = allMatches.find(m => m.status !== 'finished' && !myPredictions[m.id]);
  const homeNext = $('home-next-match');
  if (next) {
    homeNext.innerHTML = buildMatchCard(next, false);
  } else {
    homeNext.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>¡Tienes todas las porras al día!</p></div>`;
  }

  // Recent predictions (last 5 with result)
  const recent = allMatches
    .filter(m => myPredictions[m.id])
    .slice(-5).reverse();
  const homeRecent = $('home-recent');
  if (recent.length === 0) {
    homeRecent.innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>Aún no has hecho ninguna porra</p></div>`;
  } else {
    homeRecent.innerHTML = recent.map(m => buildMatchCard(m, true)).join('');
  }
}

function renderHomeStats() {
  const me = members.find(m => m.uid === currentUser.uid);
  if (!me) return;

  $('home-user-name').textContent = myName().split(' ')[0];

  const rank = members.findIndex(m => m.uid === currentUser.uid) + 1;
  $('home-rank').textContent   = `#${rank}`;
  $('home-total').textContent  = members.length;
  $('home-points').textContent = me.totalPoints || 0;

  const accuracy = me.predictions > 0 ? Math.round((me.correct / me.predictions) * 100) + '%' : '–';
  $('home-accuracy').textContent = accuracy;
  $('home-streak').textContent   = `${me.streak || 0}🔥`;

  const pending = allMatches.filter(m => m.status !== 'finished' && !myPredictions[m.id]).length;
  $('home-sub').textContent = pending > 0
    ? `Tienes ${pending} porra${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''}`
    : '¡Al día con todas las porras! 🎉';
}

// ── Matches Page ──────────────────────────────────────────
function renderMatchesPage() {
  const filter = document.querySelector('.filter-tabs .tab.active')?.dataset.filter || 'upcoming';
  const now    = new Date();

  let filtered = allMatches;
  if (filter === 'upcoming')  filtered = allMatches.filter(m => m.status === 'upcoming' && new Date(m.date) > now);
  if (filter === 'live')      filtered = allMatches.filter(m => m.status === 'live');
  if (filter === 'finished')  filtered = allMatches.filter(m => m.status === 'finished');

  if (filtered.length === 0) {
    $('matches-list').innerHTML = `<div class="empty-state"><div class="icon">⚽</div><p>No hay partidos en esta categoría</p></div>`;
    return;
  }

  // Group by phase
  const byPhase = {};
  filtered.forEach(m => {
    const ph = m.phase || 'group';
    if (!byPhase[ph]) byPhase[ph] = [];
    byPhase[ph].push(m);
  });

  let html = '';
  for (const [phase, matches] of Object.entries(byPhase)) {
    html += `<div class="phase-label">${PHASES[phase] || phase}</div>`;
    html += matches.map(m => buildMatchCard(m, true)).join('');
  }
  $('matches-list').innerHTML = html;
}

// ── My Predictions ────────────────────────────────────────
function renderMyPredictionsPage() {
  const predicted = allMatches.filter(m => myPredictions[m.id]);
  if (predicted.length === 0) {
    $('my-predictions-list').innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>Aún no has hecho ninguna porra.<br>¡Ve a Partidos y empieza a predecir!</p></div>`;
    return;
  }
  $('my-predictions-list').innerHTML = predicted.map(m => buildMatchCard(m, true)).join('');
}

// ── Leaderboard ───────────────────────────────────────────
function renderLeaderboard() {
  if (members.length === 0) {
    $('leaderboard-list').innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>Invita a tus amigos con el código de grupo</p></div>`;
    return;
  }

  const rankEmoji = ['🥇', '🥈', '🥉'];
  $('leaderboard-list').innerHTML = members.map((m, i) => {
    const isMe = m.uid === currentUser.uid;
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const accuracy = m.predictions > 0 ? Math.round((m.correct / m.predictions) * 100) + '%' : '0%';
    const streakIcon = m.streak >= 5 ? '🔥🔥' : m.streak >= 3 ? '🔥' : '';

    return `
    <div class="leaderboard-item${isMe ? ' me' : ''}">
      <div class="lb-rank ${rankClass}">${rankEmoji[i] || `#${i + 1}`}</div>
      ${m.photoURL
        ? `<img class="lb-avatar" src="${m.photoURL}" alt="">`
        : `<div class="lb-avatar-placeholder">👤</div>`}
      <div class="lb-info">
        <div class="lb-name">${escHtml(m.displayName)}${isMe ? ' <small style="color:var(--accent)">(tú)</small>' : ''}</div>
        <div class="lb-sub">${m.correct || 0} aciertos · ${accuracy} precisión</div>
      </div>
      ${streakIcon ? `<span class="lb-streak">${streakIcon}</span>` : ''}
      <div class="lb-points">${m.totalPoints || 0} pts</div>
    </div>`;
  }).join('');
}

// ── Group Page ────────────────────────────────────────────
function renderGroupPage() {
  if (!groupData) return;
  $('group-name-display').textContent = groupData.name;
  $('group-invite-code').textContent  = groupData.inviteCode;
  $('member-count').textContent       = members.length;

  $('members-list').innerHTML = members.map(m => `
    <div class="member-item">
      ${m.photoURL
        ? `<img class="member-avatar" src="${m.photoURL}" alt="">`
        : `<div class="lb-avatar-placeholder" style="width:38px;height:38px;font-size:.9rem">👤</div>`}
      <span class="member-name">${escHtml(m.displayName)}</span>
      ${groupData.adminUid === m.uid ? '<span style="font-size:.7rem;color:var(--gold)">Admin ⭐</span>' : ''}
      <span class="member-pts">${m.totalPoints || 0} pts</span>
    </div>
  `).join('');

  $('admin-panel').style.display = isAdmin ? 'block' : 'none';
}

// ── Match Card Builder ────────────────────────────────────
function buildMatchCard(match, showPrediction) {
  const pred   = myPredictions[match.id];
  const now    = new Date();
  const mDate  = new Date(match.date);
  const isPast = mDate < now;
  const isLive = match.status === 'live';
  const isDone = match.status === 'finished';
  const canPredict = !isDone && !isLive && !isPast;

  const statusLabel = isDone ? 'Finalizado' : isLive ? '🔴 EN VIVO' : formatMatchDate(mDate);
  const statusClass = isDone ? 'finished' : isLive ? 'live' : 'upcoming';

  // Score display
  let scorePart = '';
  if (isDone || isLive) {
    const hs = match.homeScore ?? '?';
    const as = match.awayScore ?? '?';
    scorePart = `<div class="match-score-display">${hs} – ${as}</div>`;
  } else {
    scorePart = `<div class="vs">vs</div>`;
  }

  // Prediction chip
  let predChip = '';
  if (showPrediction && pred) {
    if (isDone) {
      // Partido terminado: mostrar puntos obtenidos
      const pts       = pred.points;
      const chipClass = pts === null ? 'waiting' : pts >= 6 ? 'correct6' : pts >= 3 ? 'correct3' : 'wrong';
      const ptsLabel  = pts === null
        ? `🔮 ${pred.homeScore}–${pred.awayScore}`
        : pts > 0 ? `+${pts} pts · ${pred.homeScore}–${pred.awayScore}` : `✗ ${pred.homeScore}–${pred.awayScore}`;
      predChip = `<span class="prediction-chip ${chipClass}">${ptsLabel}</span>`;
    } else if (canPredict) {
      // Partido no empezado + tiene porra → editable
      predChip = `<span class="prediction-chip editable">✏️ ${pred.homeScore}–${pred.awayScore} · toca para editar</span>`;
    } else {
      // Partido empezando / live + tiene porra → bloqueada
      predChip = `<span class="prediction-chip waiting">🔒 ${pred.homeScore}–${pred.awayScore} · cerrada</span>`;
    }
  } else if (showPrediction && !pred && !isDone) {
    if (canPredict) {
      predChip = `<span class="prediction-chip nopred">⚠️ Sin porra · toca para predecir</span>`;
    } else {
      predChip = `<span class="prediction-chip wrong">🚫 Sin porra</span>`;
    }
  }

  const spainBadge = match.isSpainMatch ? `<span class="spain-badge">🇪🇸 +goleadores</span>` : '';
  const groupLabel = match.group ? `Grupo ${match.group}` : PHASES[match.phase] || '';

  const clickAttr = canPredict ? `onclick="openPredictionModal('${match.id}')"` : '';

  return `
  <div class="match-card${match.isSpainMatch ? ' spain' : ''}${isDone ? ' finished' : ''}${isLive ? ' live' : ''}" ${clickAttr}>
    <div class="match-meta">
      <span class="match-group">${groupLabel}</span>
      ${spainBadge}
      <span class="match-status ${statusClass}">${statusLabel}</span>
    </div>
    <div class="match-teams">
      <div class="team">
        <span class="team-flag">${match.homeFlag || '🏳'}</span>
        <span class="team-name">${escHtml(match.home)}</span>
      </div>
      ${scorePart}
      <div class="team">
        <span class="team-flag">${match.awayFlag || '🏳'}</span>
        <span class="team-name">${escHtml(match.away)}</span>
      </div>
    </div>
    ${predChip ? `<div style="margin-top:.5rem">${predChip}</div>` : ''}
    ${match.city ? `<div style="font-size:.7rem;color:var(--text-dim);margin-top:.3rem">📍 ${escHtml(match.city)}</div>` : ''}
  </div>`;
}

// ── Prediction Modal ──────────────────────────────────────
window.openPredictionModal = function(matchId) {
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return;

  // Bloquear si el partido ya ha empezado o terminado
  if (new Date(match.date) <= new Date() || match.status === 'live' || match.status === 'finished') {
    showToast('Ya no se pueden hacer porras: el partido ha comenzado', 'error');
    return;
  }

  const pred = myPredictions[matchId];
  activeMatchId = matchId;
  // Cargar goleadores guardados (soporta formato antiguo string[] y nuevo {name,goals}[])
  selectedGoalscorers = {};
  for (const g of pred?.goalscorers || []) {
    if (typeof g === 'string') selectedGoalscorers[g] = 1;
    else selectedGoalscorers[g.name] = g.goals;
  }

  $('pred-modal-title').textContent  = `${match.homeFlag} ${match.home} vs ${match.away} ${match.awayFlag}`;
  $('pred-home-flag').textContent    = match.homeFlag || '🏳';
  $('pred-home-name').textContent    = match.home;
  $('pred-away-flag').textContent    = match.awayFlag || '🏳';
  $('pred-away-name').textContent    = match.away;
  $('pred-home-score').value         = pred?.homeScore ?? 0;
  $('pred-away-score').value         = pred?.awayScore ?? 0;
  $('toggle-surprise').checked       = pred?.surprisePick || false;

  // Spain goalscorer section
  const gsSection = $('goalscorer-section');
  const infoX2    = $('info-x2');
  if (match.isSpainMatch) {
    gsSection.style.display = 'block';
    infoX2.style.display    = 'flex';
    renderPlayersGrid();
  } else {
    gsSection.style.display = 'none';
    infoX2.style.display    = 'none';
  }

  $('modal-prediction').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function closePredictionModal() {
  $('modal-prediction').classList.add('hidden');
  document.body.style.overflow = '';
  activeMatchId = null;
}

function renderPlayersGrid() {
  const posLabels = { POR: 'Porteros', DEF: 'Defensas', MED: 'Centrocampistas', DEL: 'Delanteros' };
  let html = '';
  for (const [pos, label] of Object.entries(posLabels)) {
    const players = SPAIN_SQUAD.filter(p => p.pos === pos);
    if (!players.length) continue;
    html += `<div class="squad-pos-label">${label}</div>`;
    for (const p of players) {
      const goals   = selectedGoalscorers[p.name] || 0;
      const isSelected = goals > 0;
      html += `
        <div class="player-row${isSelected ? ' selected' : ''}">
          <span class="pos">${p.pos}</span>
          <span class="player-name">${escHtml(p.name)}</span>
          <div class="goal-stepper">
            <button class="stepper-btn" onclick="adjustGoalscorer('${escAttr(p.name)}', -1)">–</button>
            <span class="goal-count">${isSelected ? goals + ' ⚽' : '0'}</span>
            <button class="stepper-btn" onclick="adjustGoalscorer('${escAttr(p.name)}', 1)">+</button>
          </div>
        </div>`;
    }
  }
  $('players-grid').innerHTML = html;
}

window.adjustGoalscorer = function(name, delta) {
  const current = selectedGoalscorers[name] || 0;
  const next    = Math.max(0, Math.min(5, current + delta));
  if (next === 0) delete selectedGoalscorers[name];
  else selectedGoalscorers[name] = next;
  renderPlayersGrid();
};

async function submitPrediction() {
  if (!activeMatchId) return;

  // Comprobación de seguridad: rechazar si el partido ya empezó
  const match = allMatches.find(m => m.id === activeMatchId);
  if (!match || new Date(match.date) <= new Date() || match.status === 'live' || match.status === 'finished') {
    showToast('El partido ya ha comenzado, no se puede modificar la porra', 'error');
    closePredictionModal();
    return;
  }

  const hs = parseInt($('pred-home-score').value) || 0;
  const as = parseInt($('pred-away-score').value) || 0;
  const surprise = $('toggle-surprise').checked;

  const predId = `${currentUser.uid}_${activeMatchId}`;
  const ref    = doc(db, 'groups', currentGroupId, 'predictions', predId);

  try {
    await setDoc(ref, {
      uid:           currentUser.uid,
      matchId:       activeMatchId,
      homeScore:     hs,
      awayScore:     as,
      goalscorers:   Object.entries(selectedGoalscorers)
                       .filter(([, g]) => g > 0)
                       .map(([name, goals]) => ({ name, goals })),
      surprisePick:  surprise,
      points:        myPredictions[activeMatchId]?.points ?? null,
      submittedAt:   serverTimestamp(),
    }, { merge: true });

    // Update member prediction count
    const match = allMatches.find(m => m.id === activeMatchId);
    if (!myPredictions[activeMatchId]) {
      await updateDoc(doc(db, 'groups', currentGroupId, 'members', currentUser.uid), {
        predictions: (members.find(m => m.uid === currentUser.uid)?.predictions || 0) + 1,
      });
    }

    showToast('¡Porra guardada! 🎯', 'success');
    closePredictionModal();
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  }
}

// ── Admin: Update Results ─────────────────────────────────
function openResultsModal() {
  resSelectedMatchId = null;
  resSelectedGoalscorers = new Set();
  $('res-step-select').style.display = 'block';
  $('res-step-form').style.display   = 'none';

  // Solo mostrar partidos que ya han comenzado (hora actual >= hora del partido)
  const matchesToShow = allMatches.filter(m => m.status !== 'finished' && new Date(m.date) <= new Date());
  if (matchesToShow.length === 0) {
    $('res-match-list').innerHTML = `<div class="empty-state"><p>No hay partidos en curso o recientes.<br>Los resultados solo se pueden añadir una vez que el partido haya comenzado.</p></div>`;
  } else {
    $('res-match-list').innerHTML = matchesToShow.map(m => `
      <div class="result-match-item" onclick="selectResultMatch('${m.id}')">
        <div class="result-teams-mini">${m.homeFlag} ${escHtml(m.home)} vs ${escHtml(m.away)} ${m.awayFlag}</div>
        <span style="color:var(--text-dim);font-size:.75rem">${formatMatchDate(new Date(m.date))}</span>
      </div>
    `).join('');
  }

  $('modal-results').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

window.selectResultMatch = function(matchId) {
  resSelectedMatchId = matchId;
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return;

  $('res-home-flag').textContent = match.homeFlag;
  $('res-home-name').textContent = match.home;
  $('res-away-flag').textContent = match.awayFlag;
  $('res-away-name').textContent = match.away;
  $('res-home-score').value = match.homeScore ?? 0;
  $('res-away-score').value = match.awayScore ?? 0;

  const gsSection = $('res-goalscorer-section');
  if (match.isSpainMatch) {
    gsSection.style.display = 'block';
    resSelectedGoalscorers = {};
    for (const g of match.goalscorers || []) {
      if (typeof g === 'string') resSelectedGoalscorers[g] = 1;
      else resSelectedGoalscorers[g.name] = g.goals;
    }
    renderResPlayersGrid();
  } else {
    gsSection.style.display = 'none';
    resSelectedGoalscorers = {};
  }

  $('res-step-select').style.display = 'none';
  $('res-step-form').style.display   = 'block';
};

function renderResPlayersGrid() {
  const posLabels = { POR: 'Porteros', DEF: 'Defensas', MED: 'Centrocampistas', DEL: 'Delanteros' };
  let html = '';
  for (const [pos, label] of Object.entries(posLabels)) {
    const players = SPAIN_SQUAD.filter(p => p.pos === pos);
    if (!players.length) continue;
    html += `<div class="squad-pos-label">${label}</div>`;
    for (const p of players) {
      const goals      = resSelectedGoalscorers[p.name] || 0;
      const isSelected = goals > 0;
      html += `
        <div class="player-row${isSelected ? ' selected' : ''}">
          <span class="pos">${p.pos}</span>
          <span class="player-name">${escHtml(p.name)}</span>
          <div class="goal-stepper">
            <button class="stepper-btn" onclick="adjustResGoalscorer('${escAttr(p.name)}', -1)">–</button>
            <span class="goal-count">${isSelected ? goals + ' ⚽' : '0'}</span>
            <button class="stepper-btn" onclick="adjustResGoalscorer('${escAttr(p.name)}', 1)">+</button>
          </div>
        </div>`;
    }
  }
  $('res-players-grid').innerHTML = html;
}

window.adjustResGoalscorer = function(name, delta) {
  const current = resSelectedGoalscorers[name] || 0;
  const next    = Math.max(0, Math.min(5, current + delta));
  if (next === 0) delete resSelectedGoalscorers[name];
  else resSelectedGoalscorers[name] = next;
  renderResPlayersGrid();
};

async function saveMatchResult() {
  if (!resSelectedMatchId) return;
  const hs          = parseInt($('res-home-score').value) || 0;
  const as          = parseInt($('res-away-score').value) || 0;
  const goalscorers = Object.entries(resSelectedGoalscorers)
    .filter(([, g]) => g > 0)
    .map(([name, goals]) => ({ name, goals }));

  try {
    // 1. Save result to Firestore
    await setDoc(doc(db, 'groups', currentGroupId, 'results', resSelectedMatchId), {
      homeScore:   hs,
      awayScore:   as,
      goalscorers,
      status:      'finished',
      updatedAt:   serverTimestamp(),
    });

    const matchData = { homeScore: hs, awayScore: as, goalscorers, isSpainMatch: allMatches.find(m => m.id === resSelectedMatchId)?.isSpainMatch };

    // 2. Get all predictions for this match
    const predsSnap = await getDocs(
      query(collection(db, 'groups', currentGroupId, 'predictions'),
            where('matchId', '==', resSelectedMatchId))
    );

    // 3. Calculate points for each prediction and update
    const batch = writeBatch(db);
    for (const predDoc of predsSnap.docs) {
      const pred   = predDoc.data();
      const points = calculatePoints(pred, matchData);
      batch.update(predDoc.ref, { points });
    }
    await batch.commit();

    // 4. Recalculate total points for all members
    await recalculateMemberPoints();

    showToast('¡Resultado guardado y puntos actualizados!', 'success');
    $('modal-results').classList.add('hidden');
    document.body.style.overflow = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Admin: Add Match ──────────────────────────────────────
async function saveNewMatch() {
  const home     = $('add-home').value.trim();
  const away     = $('add-away').value.trim();
  const dateVal  = $('add-date').value;
  if (!home || !away || !dateVal) { showToast('Rellena todos los campos', 'error'); return; }

  // Convert Spain local time to UTC
  const localDate = new Date(dateVal);
  const utcString = localDate.toISOString();

  const newMatch = {
    phase:       $('add-phase').value,
    group:       $('add-group').value.trim().toUpperCase() || null,
    home,
    homeFlag:    $('add-home-flag').value.trim() || '🏳',
    away,
    awayFlag:    $('add-away-flag').value.trim() || '🏳',
    date:        utcString,
    city:        $('add-city').value.trim(),
    venue:       '',
    isSpainMatch: $('add-is-spain').checked,
    status:      'upcoming',
    homeScore:   null,
    awayScore:   null,
    goalscorers: [],
    createdAt:   serverTimestamp(),
  };

  try {
    await setDoc(doc(collection(db, 'groups', currentGroupId, 'matches')), newMatch);
    showToast('Partido añadido ✓', 'success');
    $('modal-add-match').classList.add('hidden');
    document.body.style.overflow = '';
    // Clear form
    ['add-home','add-home-flag','add-away','add-away-flag','add-date','add-city','add-group'].forEach(id => { $(id).value = ''; });
    $('add-is-spain').checked = false;
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Scoring Logic ─────────────────────────────────────────
function calculatePoints(pred, match) {
  if (match.homeScore === null || match.awayScore === null) return null;

  const predOutcome   = outcome(pred.homeScore, pred.awayScore);
  const actualOutcome = outcome(match.homeScore, match.awayScore);
  const exactResult   = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;

  let pts = 0;
  if (exactResult)                    pts = 6;
  else if (predOutcome === actualOutcome) pts = 3;

  // España: +2 pts por cada goleador acertado (independiente del resultado)
  if (match.isSpainMatch && pred.goalscorers?.length > 0) {
    const predNames    = pred.goalscorers.map(g => typeof g === 'string' ? g : g.name);
    const actualNames  = (match.goalscorers || []).map(g => typeof g === 'string' ? g : g.name);
    const correctCount = predNames.filter(n => actualNames.includes(n)).length;
    pts += correctCount * 2;
  }

  // Porra Sorpresa +3 (solo si el resultado fue correcto)
  if (pred.surprisePick && pts > 0) pts += 3;

  return pts;
}

function outcome(h, a) {
  if (h > a) return 'H';
  if (a > h) return 'A';
  return 'D';
}

async function recalculateMemberPoints() {
  const membersSnap = await getDocs(collection(db, 'groups', currentGroupId, 'members'));
  const batch       = writeBatch(db);

  for (const memberDoc of membersSnap.docs) {
    const uid      = memberDoc.id;
    const predsSnap = await getDocs(
      query(collection(db, 'groups', currentGroupId, 'predictions'), where('uid', '==', uid))
    );

    let totalPoints = 0, correct = 0, predictions = 0, streak = 0;
    const preds = predsSnap.docs.map(d => d.data()).filter(p => p.points !== null);

    // Sort by submission time to calculate streak correctly
    preds.sort((a, b) => {
      const ta = a.submittedAt?.seconds || 0;
      const tb = b.submittedAt?.seconds || 0;
      return ta - tb;
    });

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

// ── Share / Copy invite ───────────────────────────────────
function copyInviteCode() {
  const code = groupData?.inviteCode;
  if (!code) return;
  navigator.clipboard?.writeText(code)
    .then(() => showToast('¡Código copiado!', 'success'))
    .catch(() => showToast('Código: ' + code, 'info'));
}

function shareInviteCode() {
  const code = groupData?.inviteCode;
  const url  = window.location.href;
  const text = `¡Únete a la Porra del Mundial 2026 con el código *${code}*!\n${url}`;
  if (navigator.share) {
    navigator.share({ title: 'Porra Mundial 2026', text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text);
    showToast('¡Enlace copiado!', 'success');
  }
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent  = msg;
  t.className    = `toast ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout   = setTimeout(() => t.classList.add('hidden'), 3200);
}

// ── Helpers ───────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/'/g,"\\'");
}

function formatMatchDate(date) {
  const now   = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const opts  = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  if (isToday) return 'Hoy · ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('es-ES', opts);
}

// ── Notificaciones Push ───────────────────────────────────
async function setupNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  try {
    // Registrar Service Worker
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('Service Worker no disponible:', err.message);
    return;
  }

  if (Notification.permission === 'granted') {
    await saveFcmToken();
  } else if (Notification.permission === 'default') {
    showNotificationBanner();
  }
  // Si es 'denied', no hacemos nada
}

function showNotificationBanner() {
  if (document.getElementById('notif-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'notif-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:50%;transform:translateX(-50%);
    width:100%;max-width:480px;z-index:999;
    background:#1a2236;border-bottom:1px solid #1f2d44;
    padding:.7rem 1rem;display:flex;align-items:center;gap:.65rem;
    box-shadow:0 4px 16px #0006;
  `;
  banner.innerHTML = `
    <span style="font-size:1.2rem;flex-shrink:0">🔔</span>
    <div style="flex:1;font-size:.8rem;line-height:1.3">
      <strong>Activa los recordatorios</strong><br>
      <span style="color:#6b7a99">Te avisamos 1h antes de cada partido si no tienes porra</span>
    </div>
    <button id="btn-allow-notif"
      style="background:#00e676;color:#000;border:none;border-radius:8px;
      padding:.4rem .85rem;font-size:.78rem;font-weight:700;cursor:pointer;flex-shrink:0">
      Activar
    </button>
    <button id="btn-dismiss-notif"
      style="background:none;border:none;color:#6b7a99;font-size:1.1rem;cursor:pointer;flex-shrink:0;padding:0 .2rem">
      ✕
    </button>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-allow-notif').addEventListener('click', requestNotifPermission);
  document.getElementById('btn-dismiss-notif').addEventListener('click', () => banner.remove());
}

async function requestNotifPermission() {
  document.getElementById('notif-banner')?.remove();
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await saveFcmToken();
    showToast('¡Notificaciones activadas! 🔔', 'success');
  } else {
    showToast('Notificaciones desactivadas', 'info');
  }
}

async function saveFcmToken() {
  if (!VAPID_KEY || VAPID_KEY === 'TU_CLAVE_VAPID_PUBLICA') return; // no configurado aún
  try {
    const swReg    = await navigator.serviceWorker.ready;
    const msgInst  = getMessaging(firebaseApp);
    const token    = await getToken(msgInst, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await updateDoc(doc(db, 'users', currentUser.uid), { fcmToken: token });
    }

    // Escuchar mensajes mientras la app está en primer plano
    onMessage(msgInst, payload => {
      const n = payload.notification || {};
      showToast(`${n.title}: ${n.body}`, 'info');
    });
  } catch (err) {
    console.warn('No se pudo obtener el token FCM:', err.message);
  }
}

// ── Event Listeners ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Login
  $('btn-enter').addEventListener('click', loginWithName);
  $('input-player-name').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithName(); });

  // Group setup
  $('btn-create-group').addEventListener('click', () => createGroup($('input-group-name').value));
  $('btn-join-group').addEventListener('click',   () => joinGroup($('input-invite-code').value));
  $('btn-logout-setup').addEventListener('click', logout);
  $('input-invite-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });

  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // Filter tabs
  document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderMatchesPage();
    });
  });

  // Prediction modal
  $('btn-submit-pred').addEventListener('click', submitPrediction);
  $('btn-close-pred-modal').addEventListener('click', closePredictionModal);
  $('modal-pred-overlay').addEventListener('click', closePredictionModal);

  // Results modal
  $('btn-open-results').addEventListener('click', openResultsModal);
  $('btn-close-results-modal').addEventListener('click', () => {
    $('modal-results').classList.add('hidden');
    document.body.style.overflow = '';
  });
  $('modal-res-overlay').addEventListener('click', () => {
    $('modal-results').classList.add('hidden');
    document.body.style.overflow = '';
  });
  $('btn-save-result').addEventListener('click', saveMatchResult);
  $('btn-res-back').addEventListener('click', () => {
    $('res-step-select').style.display = 'block';
    $('res-step-form').style.display   = 'none';
  });

  // Add match modal
  $('btn-open-add-match').addEventListener('click', () => {
    $('modal-add-match').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
  $('btn-close-add-modal').addEventListener('click', () => {
    $('modal-add-match').classList.add('hidden');
    document.body.style.overflow = '';
  });
  $('modal-add-overlay').addEventListener('click', () => {
    $('modal-add-match').classList.add('hidden');
    document.body.style.overflow = '';
  });
  $('btn-save-match').addEventListener('click', saveNewMatch);

  // Group page actions
  $('btn-copy-invite').addEventListener('click', copyInviteCode);
  $('btn-share-invite').addEventListener('click', shareInviteCode);
  $('btn-logout-main').addEventListener('click', logout);

  // Score inputs: no negative, clamp to 0-20
  document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', () => {
      let v = parseInt(input.value);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 20) v = 20;
      input.value = v;
    });
    input.addEventListener('focus', () => input.select());
  });
});
