// Pomocník na „kreslenie“ levelov kódom namiesto ručného písania stoviek riadkov ASCII.
// Výsledok je mriežka znakov:
//   '#' zem/stena   '=' platforma (dá sa z nej zoskočiť a preskočiť zdola)   'R' skala
//   'X' tmavá výplň '~' hladina vody   '|' začiatok vodopádu   'v','f' dekorácie (bez kolízie)
//   'P' štart hráča 'E' pešiak  'e' generátor pešiakov  'S' strelec  'D' dron s power-upom
//   'T' veža        'C' checkpoint  'A' začiatok arény bossa  'B' boss
// POZOR: musí byť deterministické (žiadne Math.random) – klienti si level stavajú sami.
export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.g = Array.from({ length: rows }, () => new Array(cols).fill(' '));
  }

  set(x, y, ch) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.g[y][x] = ch;
    return this;
  }

  get(x, y) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return ' ';
    return this.g[y][x];
  }

  /** Obdĺžnik (vrátane okrajov). */
  fill(x0, y0, x1, y1, ch = '#') {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }

  /** Zem od stĺpca x0 po x1 s výškou h dlaždíc (od spodku mapy). */
  ground(x0, x1, h) { return this.fill(x0, this.rows - h, x1, this.rows - 1, '#'); }

  /** Vodorovná platforma. */
  plat(x, y, len, ch = '=') { return this.fill(x, y, x + len - 1, y, ch); }

  /** Riadok najvyššej pevnej dlaždice v stĺpci x (alebo rows). */
  top(x, from = 0) {
    const solid = (y) => '#RX='.includes(this.get(x, y));
    let y = from;
    while (y < this.rows && solid(y)) y++;      // preskoč strop
    while (y < this.rows && !solid(y)) y++;     // nájdi podlahu
    return y;
  }

  /** Postaví entitu (znak) na zem v stĺpci x. */
  on(ch, x, from = 0) { return this.set(x, this.top(x, from) - 1, ch); }

  /** Voda: hladina v riadku y od x0 po x1. */
  water(x0, x1, y) { return this.fill(x0, y, x1, y, '~'); }

  toStrings() { return this.g.map((r) => r.join('')); }
}
