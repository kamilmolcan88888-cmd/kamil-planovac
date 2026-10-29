// Chiptune skladby (vlastné, originálne). Každá skladba = akordy + melódia + rytmy.
// Zápis melódie: "NOTA:dĺžka" v šestnástinách, "r:dĺžka" = pauza.
// Basový vzor (16 znakov na takt): R = základný tón, O = o oktávu vyššie, F = kvinta,
//   '-' = predĺženie predchádzajúcej noty, '.' = ticho.
// Bicie (16 znakov): k = kick, s = snare, h = hi-hat, x = kick+hat, '.' = nič.
import { freq } from './notes.js';

const DEFS = {
  // MENU – 90 BPM, D mol, pokojné a tajomné
  menu: {
    bpm: 90,
    chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],
    lead: 'D5:8 F5:4 E5:4 D5:8 C5:4 Bb4:4 A4:8 C5:4 F5:4 E5:12 r:4 ' +
          'D5:6 E5:2 F5:4 A5:4 G5:8 F5:4 D5:4 Bb4:8 D5:4 G5:4 C#5:12 r:4',
    bass: ['R-------F-------', 'R-------O-------'],
    arpRate: 2,
    drums: ['k.......s.......', 'k.......s.....h.'],
  },
  // DŽUNGĽA – 140 BPM, A mol, hrdinská
  jungle: {
    bpm: 140,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'E'],
    lead: 'A4:3 A4:1 C5:2 E5:2 A5:4 G5:2 E5:2 ' +
          'F5:4 E5:2 C5:2 A4:4 C5:4 ' +
          'G4:2 C5:2 E5:2 G5:2 E5:4 D5:2 C5:2 ' +
          'D5:6 B4:2 G4:4 B4:2 D5:2 ' +
          'A5:3 A5:1 G5:2 E5:2 C5:2 E5:2 A5:4 ' +
          'F5:2 G5:2 A5:4 G5:2 F5:2 E5:4 ' +
          'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4 ' +
          'G#5:4 B5:2 G#5:2 E5:8',
    bass: ['R.R.O.R.R.R.O.R.', 'R.R.O.R.F.F.O.F.'],
    arpRate: 1,
    drums: ['x.h.s.h.x.x.s.h.', 'x.h.s.h.x.h.s.ss'],
  },
  // KRYŠTÁLOVÁ JASKYŇA – 100 BPM, E mol, ozvenové arpeggiá
  cave: {
    bpm: 100,
    chords: ['Em', 'C', 'Am', 'B', 'Em', 'C', 'Am', 'B'],
    lead: 'B4:4 r:2 E5:2 G5:4 F#5:4 E5:8 r:4 G4:4 A4:4 C5:4 E5:4 D5:4 D#5:8 F#5:4 B4:4 ' +
          'E5:4 G5:4 B5:6 A5:2 G5:8 E5:4 C5:4 C5:4 E5:4 A5:4 G5:4 F#5:12 r:4',
    bass: ['R-----R-F-------', 'R-------O---F---'],
    arpRate: 1,
    drums: ['k.....h.s.....h.', 'k.....h.s...h.h.'],
  },
  // PODZEMNÁ ZÁKLADŇA – 150 BPM, C mol, industriálna
  base: {
    bpm: 150,
    chords: ['Cm', 'Ab', 'Bb', 'G', 'Ab', 'Cm', 'Bb', 'G'],
    lead: 'C5:2 C5:2 r:2 Eb5:2 G5:2 r:2 F5:2 Eb5:2 C5:4 Eb5:2 Ab5:6 G5:4 ' +
          'F5:2 F5:2 r:2 D5:2 Bb4:4 D5:4 B4:4 D5:4 G5:4 F5:2 D5:2 ' +
          'C6:4 G5:2 Eb5:2 C5:4 Eb5:4 Ab5:4 G5:4 Eb5:4 C5:4 ' +
          'D5:2 F5:2 Bb5:4 A5:4 F5:4 G5:4 B4:4 D5:4 F5:2 G5:2',
    bass: ['RRO.RRO.RRO.RFOR', 'RRO.RRO.RRO.OFRF'],
    arpRate: 1,
    drums: ['x.hhs.hhx.hxs.hh', 'x.hhs.hhx.xxs.ss'],
  },
  // REAKTOR – 120 BPM, F# mol, napäté
  reactor: {
    bpm: 120,
    chords: ['F#m', 'D', 'E', 'C#'],
    lead: 'F#5:6 A5:2 C#6:4 B5:4 A5:8 F#5:4 D5:4 E5:4 G#5:4 B5:4 E5:4 F5:8 G#5:4 C#5:4',
    bass: ['R.R.R.O.R.R.R.O.'],
    arpRate: 1,
    drums: ['k...s...k.k.s...', 'k...s...k.k.s.hh'],
  },
  // BOSS – 170 BPM, E mol, agresívna
  boss: {
    bpm: 170,
    chords: ['Em', 'Em', 'C', 'B', 'Em', 'Em', 'D', 'B'],
    lead: 'E5:1 r:1 E5:1 r:1 G5:2 E5:2 B5:4 A5:2 G5:2 ' +
          'F#5:2 G5:2 F#5:2 E5:2 D5:4 B4:4 ' +
          'C5:2 E5:2 G5:2 C6:2 B5:4 G5:4 ' +
          'D#5:4 F#5:4 B5:6 r:2 ' +
          'E6:2 D6:2 B5:2 G5:2 E5:4 G5:4 ' +
          'A5:2 G5:2 F#5:2 E5:2 F#5:4 G5:4 ' +
          'A5:4 F#5:4 D5:4 A5:4 ' +
          'B5:4 A5:2 F#5:2 D#5:8',
    bass: ['RRORRRORRRORRFOR'],
    arpRate: 1,
    drums: ['x.s.x.s.x.s.xxs.', 'x.s.x.s.x.s.ssss'],
  },
};

const CHORD_RE = /^([A-G][#b]?)(m?)/;
function chordNotes(name) {
  const [, root, minor] = CHORD_RE.exec(name);
  const third = minor ? 3 : 4;
  const r4 = freq(`${root}4`);
  return {
    bass: freq(`${root}2`),
    fifth: freq(`${root}2`) * 2 ** (7 / 12),
    arp: [r4, r4 * 2 ** (third / 12), r4 * 2 ** (7 / 12), r4 * 2],
  };
}

/** Prevedie čitateľný zápis na polia krokov (index = šestnástina). */
function compile(def) {
  const len = def.chords.length * 16;
  const lead = new Array(len).fill(null);
  const bass = new Array(len).fill(null);
  const arp = new Array(len).fill(null);
  const drums = new Array(len).fill(null);

  // melódia (ak je kratšia, opakuje sa)
  const tokens = def.lead.trim().split(/\s+/).map((t) => { const [n, l] = t.split(':'); return { n, l: Number(l) }; });
  let pos = 0;
  while (pos < len) {
    for (const t of tokens) {
      if (pos >= len) break;
      if (t.n !== 'r') lead[pos] = { f: freq(t.n), len: t.l };
      pos += t.l;
    }
  }

  def.chords.forEach((ch, bar) => {
    const c = chordNotes(ch);
    const pat = def.bass[bar % def.bass.length];
    for (let i = 0; i < 16; i++) {
      const sym = pat[i];
      if (sym === '.' || sym === '-') continue;
      let l = 1;
      while (i + l < 16 && pat[i + l] === '-') l++;
      const f = sym === 'O' ? c.bass * 2 : sym === 'F' ? c.fifth : c.bass;
      bass[bar * 16 + i] = { f, len: l };
    }
    for (let i = 0; i < 16; i += def.arpRate) arp[bar * 16 + i] = { f: c.arp[(i / def.arpRate) % 4] };
    const dp = def.drums[bar % def.drums.length];
    for (let i = 0; i < 16; i++) if (dp[i] !== '.') drums[bar * 16 + i] = dp[i];
  });
  return { bpm: def.bpm, length: len, lead, bass, arp, drums };
}

export const SONGS = Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, compile(v)]));
