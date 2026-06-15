#!/usr/bin/env python3
# ============================================================
# Genera js/data.js y scripts/matches.json con el calendario
# completo del Mundial 2026 desde la API pública de ESPN.
# Uso: python3 scripts/generate-data.py
# ============================================================
import json, urllib.request, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200'
STANDINGS  = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026'
SPAIN_ROSTER = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/164/roster'

POS_ES = {'Goalkeeper': 'POR', 'Defender': 'DEF', 'Midfielder': 'MED', 'Forward': 'DEL'}
POS_ORDER = {'POR': 0, 'DEF': 1, 'MED': 2, 'DEL': 3}

# Nombre en español y bandera de cada selección (nombre ESPN → es)
TEAMS = {
  'Mexico':             ('México', '🇲🇽'),
  'Czechia':            ('Chequia', '🇨🇿'),
  'South Korea':        ('Corea del Sur', '🇰🇷'),
  'South Africa':       ('Sudáfrica', '🇿🇦'),
  'Canada':             ('Canadá', '🇨🇦'),
  'Bosnia-Herzegovina': ('Bosnia', '🇧🇦'),
  'Switzerland':        ('Suiza', '🇨🇭'),
  'Qatar':              ('Catar', '🇶🇦'),
  'Brazil':             ('Brasil', '🇧🇷'),
  'Scotland':           ('Escocia', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
  'Haiti':              ('Haití', '🇭🇹'),
  'Morocco':            ('Marruecos', '🇲🇦'),
  'Paraguay':           ('Paraguay', '🇵🇾'),
  'Türkiye':            ('Turquía', '🇹🇷'),
  'Australia':          ('Australia', '🇦🇺'),
  'United States':      ('Estados Unidos', '🇺🇸'),
  'Ecuador':            ('Ecuador', '🇪🇨'),
  'Germany':            ('Alemania', '🇩🇪'),
  'Ivory Coast':        ('Costa de Marfil', '🇨🇮'),
  'Curaçao':            ('Curazao', '🇨🇼'),
  'Netherlands':        ('Países Bajos', '🇳🇱'),
  'Sweden':             ('Suecia', '🇸🇪'),
  'Japan':              ('Japón', '🇯🇵'),
  'Tunisia':            ('Túnez', '🇹🇳'),
  'Belgium':            ('Bélgica', '🇧🇪'),
  'Iran':               ('Irán', '🇮🇷'),
  'Egypt':              ('Egipto', '🇪🇬'),
  'New Zealand':        ('Nueva Zelanda', '🇳🇿'),
  'Spain':              ('España', '🇪🇸'),
  'Uruguay':            ('Uruguay', '🇺🇾'),
  'Saudi Arabia':       ('Arabia Saudí', '🇸🇦'),
  'Cape Verde':         ('Cabo Verde', '🇨🇻'),
  'Norway':             ('Noruega', '🇳🇴'),
  'France':             ('Francia', '🇫🇷'),
  'Senegal':            ('Senegal', '🇸🇳'),
  'Iraq':               ('Irak', '🇮🇶'),
  'Argentina':          ('Argentina', '🇦🇷'),
  'Austria':            ('Austria', '🇦🇹'),
  'Algeria':            ('Argelia', '🇩🇿'),
  'Jordan':             ('Jordania', '🇯🇴'),
  'Colombia':           ('Colombia', '🇨🇴'),
  'Portugal':           ('Portugal', '🇵🇹'),
  'Uzbekistan':         ('Uzbekistán', '🇺🇿'),
  'Congo DR':           ('RD Congo', '🇨🇩'),
  'England':            ('Inglaterra', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
  'Croatia':            ('Croacia', '🇭🇷'),
  'Panama':             ('Panamá', '🇵🇦'),
  'Ghana':              ('Ghana', '🇬🇭'),
}

PHASE_BY_SLUG = {
  'group-stage':      'group',
  'round-of-32':      'r32',
  'round-of-16':      'r16',
  'quarterfinals':    'qf',
  'semifinals':       'sf',
  '3rd-place-match':  'third',
  'final':            'final',
}

COUNTRY_ES = {'USA': 'USA', 'Mexico': 'México', 'Canada': 'Canadá'}

def translate_placeholder(name):
    """Traduce los nombres de cruces aún sin definir de ESPN."""
    m = re.match(r'Group (\w) Winner', name)
    if m: return f'1º Grupo {m.group(1)}'
    m = re.match(r'Group (\w) 2nd Place', name)
    if m: return f'2º Grupo {m.group(1)}'
    m = re.match(r'Third Place Group ([\w/]+)', name)
    if m: return f'3º Grupos {m.group(1)}'
    m = re.match(r'Round of 32 (\d+) Winner', name)
    if m: return f'Ganador 16avos {m.group(1)}'
    m = re.match(r'Round of 16 (\d+) Winner', name)
    if m: return f'Ganador Octavos {m.group(1)}'
    m = re.match(r'Quarterfinals? (\d+) Winner', name)
    if m: return f'Ganador Cuartos {m.group(1)}'
    m = re.match(r'Semifinals? (\d+) Winner', name)
    if m: return f'Ganador Semis {m.group(1)}'
    m = re.match(r'Semifinals? (\d+) Loser', name)
    if m: return f'Perdedor Semis {m.group(1)}'
    return name

def team_es(name):
    if name in TEAMS: return TEAMS[name]
    return (translate_placeholder(name), '❓')

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def fetch_spain_squad():
    """Convocatoria real de España para el Mundial 2026 desde ESPN."""
    data = fetch(SPAIN_ROSTER)
    squad = []
    for a in data.get('athletes', []):
        pos = POS_ES.get(a['position']['name'], a['position'].get('abbreviation', '?'))
        squad.append({'name': a['displayName'], 'pos': pos})
    squad.sort(key=lambda p: POS_ORDER.get(p['pos'], 9))
    assert 20 <= len(squad) <= 30, f'Plantilla de España con tamaño inesperado: {len(squad)}'
    return squad

def main():
    sb = fetch(SCOREBOARD)
    st = fetch(STANDINGS)

    # Mapa equipo → letra de grupo
    group_of = {}
    for g in st.get('children', []):
        letter = g['name'].replace('Group ', '').strip()
        for entry in g.get('standings', {}).get('entries', []):
            group_of[entry['team']['displayName']] = letter

    matches = []
    for e in sorted(sb['events'], key=lambda x: x['date']):
        c     = e['competitions'][0]
        home  = next(t for t in c['competitors'] if t['homeAway'] == 'home')
        away  = next(t for t in c['competitors'] if t['homeAway'] == 'away')
        hName, hFlag = team_es(home['team']['displayName'])
        aName, aFlag = team_es(away['team']['displayName'])
        phase = PHASE_BY_SLUG[e['season']['slug']]
        group = group_of.get(home['team']['displayName']) if phase == 'group' else None
        venue = c.get('venue', {})
        addr  = venue.get('address', {})
        city  = addr.get('city', '').split(',')[0].strip()
        country = COUNTRY_ES.get(addr.get('country', ''), addr.get('country', ''))
        is_spain = phase == 'group' and 'Spain' in (home['team']['displayName'], away['team']['displayName'])

        matches.append({
            'id':           e['id'],
            'phase':        phase,
            'group':        group,
            'home':         hName, 'homeFlag': hFlag,
            'away':         aName, 'awayFlag': aFlag,
            'date':         e['date'].replace('Z', ':00Z') if len(e['date']) == 17 else e['date'],
            'city':         f'{city}, {country}' if city else '',
            'venue':        venue.get('fullName', ''),
            'isSpainMatch': is_spain,
        })

    spain_ids = [m['id'] for m in matches if m['isSpainMatch']]
    assert len(spain_ids) == 3, f'Esperaba 3 partidos de España, hay {len(spain_ids)}: {spain_ids}'
    assert len(matches) == 104, f'Esperaba 104 partidos, hay {len(matches)}'

    # ── js/data.js ──
    lines = []
    for m in matches:
        grp = f"'{m['group']}'" if m['group'] else 'null'
        lines.append(
            "  { id: '%s', phase: '%s', group: %s,\n"
            "    home: %s, homeFlag: '%s', away: %s, awayFlag: '%s',\n"
            "    date: '%s', city: %s, venue: %s, isSpainMatch: %s },"
            % (m['id'], m['phase'], grp,
               json.dumps(m['home'], ensure_ascii=False), m['homeFlag'],
               json.dumps(m['away'], ensure_ascii=False), m['awayFlag'],
               m['date'], json.dumps(m['city'], ensure_ascii=False),
               json.dumps(m['venue'], ensure_ascii=False),
               'true' if m['isSpainMatch'] else 'false'))

    squad = fetch_spain_squad()
    pos_label = {'POR': 'Porteros', 'DEF': 'Defensas', 'MED': 'Centrocampistas', 'DEL': 'Delanteros'}
    squad_lines, last_pos = [], None
    for p in squad:
        if p['pos'] != last_pos:
            squad_lines.append(f"  // {pos_label.get(p['pos'], p['pos'])}")
            last_pos = p['pos']
        squad_lines.append(f"  {{ name: {json.dumps(p['name'], ensure_ascii=False)}, pos: '{p['pos']}' }},")
    squad_js = '\n'.join(squad_lines)

    data_js = HEADER.replace('{{SPAIN_SQUAD}}', squad_js) + '\n'.join(lines) + '\n];\n'
    with open(os.path.join(ROOT, 'js', 'data.js'), 'w') as f:
        f.write(data_js)

    # ── scripts/matches.json (para los scripts de GitHub Actions) ──
    with open(os.path.join(ROOT, 'scripts', 'matches.json'), 'w') as f:
        json.dump({'spainMatchIds': spain_ids, 'spainSquad': [p['name'] for p in squad],
                   'matches': matches}, f, ensure_ascii=False, indent=2)

    print(f'OK: {len(matches)} partidos, {len(squad)} jugadores de España. España: {spain_ids}')

HEADER = '''\
// ============================================================
// DATOS DEL MUNDIAL 2026
// GENERADO por scripts/generate-data.py — no editar a mano.
// Los ids de partido son los event ids de ESPN (los usa el
// script de resultados en directo para actualizar Firestore).
// ============================================================

// Convocatoria real de España (obtenida de la API de ESPN al generar)
export const SPAIN_SQUAD = [
{{SPAIN_SQUAD}}
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

// Los 104 partidos del Mundial 2026
export const BASE_MATCHES = [
'''

if __name__ == '__main__':
    main()
