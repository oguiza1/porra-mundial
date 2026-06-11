// ============================================================
// DATOS DEL MUNDIAL 2026
// Admin puede añadir/editar partidos desde el Panel de Admin
// ============================================================

export const SPAIN_SQUAD = [
  // Porteros
  { name: 'Unai Simón',       pos: 'POR' },
  { name: 'David Raya',       pos: 'POR' },
  { name: 'Álex Remiro',      pos: 'POR' },
  // Defensas
  { name: 'Carvajal',         pos: 'DEF' },
  { name: 'Laporte',          pos: 'DEF' },
  { name: 'Le Normand',       pos: 'DEF' },
  { name: 'Grimaldo',         pos: 'DEF' },
  { name: 'Cucurella',        pos: 'DEF' },
  { name: 'Pedro Porro',      pos: 'DEF' },
  { name: 'Nacho',            pos: 'DEF' },
  // Centrocampistas
  { name: 'Rodri',            pos: 'MED' },
  { name: 'Pedri',            pos: 'MED' },
  { name: 'Fabián Ruiz',      pos: 'MED' },
  { name: 'Zubimendi',        pos: 'MED' },
  { name: 'Merino',           pos: 'MED' },
  { name: 'Gavi',             pos: 'MED' },
  // Delanteros
  { name: 'Lamine Yamal',     pos: 'DEL' },
  { name: 'Nico Williams',    pos: 'DEL' },
  { name: 'Dani Olmo',        pos: 'DEL' },
  { name: 'Ferran Torres',    pos: 'DEL' },
  { name: 'Álvaro Morata',    pos: 'DEL' },
  { name: 'Mikel Oyarzabal',  pos: 'DEL' },
  { name: 'Bryan Zaragoza',   pos: 'DEL' },
  { name: 'Joselu',           pos: 'DEL' },
];

// Grupos y fases (para mostrar etiquetas en la UI)
export const PHASES = {
  group:  'Fase de Grupos',
  r32:    'Dieciseisavos',
  r16:    'Octavos de Final',
  qf:     'Cuartos de Final',
  sf:     'Semifinales',
  third:  'Tercer y Cuarto Puesto',
  final:  'FINAL',
};

// Partidos base — sólo Grupo H (España) hardcodeados
// El resto se añaden desde el Panel de Admin
export const BASE_MATCHES = [
  // ─── GRUPO H ───────────────────────────────────────────
  {
    id: 'H1',
    phase: 'group', group: 'H',
    home: 'España',      homeFlag: '🇪🇸',
    away: 'Cabo Verde',  awayFlag: '🇨🇻',
    date: '2026-06-15T22:00:00Z',
    city: 'Atlanta, USA',
    venue: 'Mercedes-Benz Stadium',
    isSpainMatch: true,
  },
  {
    id: 'H2',
    phase: 'group', group: 'H',
    home: 'Arabia Saudí', homeFlag: '🇸🇦',
    away: 'Uruguay',      awayFlag: '🇺🇾',
    date: '2026-06-15T19:00:00Z',
    city: 'Dallas, USA',
    venue: 'AT&T Stadium',
    isSpainMatch: false,
  },
  {
    id: 'H3',
    phase: 'group', group: 'H',
    home: 'España',       homeFlag: '🇪🇸',
    away: 'Arabia Saudí', awayFlag: '🇸🇦',
    date: '2026-06-21T22:00:00Z',
    city: 'Atlanta, USA',
    venue: 'Mercedes-Benz Stadium',
    isSpainMatch: true,
  },
  {
    id: 'H4',
    phase: 'group', group: 'H',
    home: 'Cabo Verde', homeFlag: '🇨🇻',
    away: 'Uruguay',    awayFlag: '🇺🇾',
    date: '2026-06-21T19:00:00Z',
    city: 'Dallas, USA',
    venue: 'AT&T Stadium',
    isSpainMatch: false,
  },
  {
    id: 'H5',
    phase: 'group', group: 'H',
    home: 'Uruguay',  homeFlag: '🇺🇾',
    away: 'España',   awayFlag: '🇪🇸',
    date: '2026-06-28T02:00:00Z',
    city: 'Guadalajara, México',
    venue: 'Estadio Akron',
    isSpainMatch: true,
  },
  {
    id: 'H6',
    phase: 'group', group: 'H',
    home: 'Arabia Saudí', homeFlag: '🇸🇦',
    away: 'Cabo Verde',   awayFlag: '🇨🇻',
    date: '2026-06-28T02:00:00Z',
    city: 'Dallas, USA',
    venue: 'AT&T Stadium',
    isSpainMatch: false,
  },
  // ─── DIECISEISAVOS (si España pasa 1ª de grupo) ────────
  {
    id: 'R32_ESP',
    phase: 'r32', group: null,
    home: 'España',  homeFlag: '🇪🇸',
    away: '2º Grupo J', awayFlag: '❓',
    date: '2026-07-02T22:00:00Z',
    city: 'Los Ángeles, USA',
    venue: 'SoFi Stadium',
    isSpainMatch: true,
  },
];
