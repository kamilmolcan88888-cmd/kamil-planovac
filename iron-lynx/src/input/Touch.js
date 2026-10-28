// Dotykové ovládanie ako DOM vrstva: virtuálny D-pad vľavo, Skok/Streľba vpravo.
// Multi-touch cez Pointer Events (každý prst má vlastné pointerId).
// Ľavá polovica obrazovky = D-pad (aj keď netrafíš presne), pravá = najbližšie tlačidlo,
// prst sa môže posúvať medzi Skokom a Streľbou bez zdvihnutia.
import { settings, saveSettings } from '../settings.js';

const $ = (id) => document.getElementById(id);

export const touch = {
  enabled: false,
  visible: false,
  editing: false,
  dir: { left: false, right: false, up: false, down: false },
  jump: false,
  fire: false,
  pausePressed: false,
  ptrs: new Map(),

  init() {
    this.enabled = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.root = $('touch');
    this.pad = $('dpad');
    this.knob = this.pad.querySelector('.dpad-knob');
    this.btns = $('btns');
    this.bJump = $('btnJump');
    this.bFire = $('btnFire');
    this.applyLayout();
    window.addEventListener('resize', () => this.applyLayout());

    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.onDown(e));
    r.addEventListener('pointermove', (e) => this.onMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) r.addEventListener(ev, (e) => this.onUp(e));
    $('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pausePressed = true; });

    $('editMinus').onclick = () => this.setScale(settings.touch.scale - 0.1);
    $('editPlus').onclick = () => this.setScale(settings.touch.scale + 0.1);
    $('editReset').onclick = () => { settings.touch.pad = null; settings.touch.btns = null; this.setScale(1); };
    $('editDone').onclick = () => this.endEdit();
  },

  setScale(v) {
    settings.touch.scale = Math.max(0.6, Math.min(1.8, Math.round(v * 10) / 10));
    saveSettings();
    this.applyLayout();
  },

  /** Rozmiestni ovládače podľa nastavení (pozície sú v zlomkoch obrazovky, takže sedia po otočení). */
  applyLayout() {
    const t = settings.touch;
    document.documentElement.style.setProperty('--tc-scale', t.scale);
    document.documentElement.style.setProperty('--tc-opacity', t.opacity);
    const place = (el, pos, def) => {
      el.style.left = el.style.right = el.style.top = el.style.bottom = '';
      if (pos) {
        el.style.left = `${pos.x * innerWidth - el.offsetWidth / 2}px`;
        el.style.top = `${pos.y * innerHeight - el.offsetHeight / 2}px`;
      } else Object.assign(el.style, def);
    };
    place(this.pad, t.pad, { left: 'calc(var(--sal) + 22px)', bottom: 'calc(var(--sab) + 18px)' });
    place(this.btns, t.btns, { right: 'calc(var(--sar) + 22px)', bottom: 'calc(var(--sab) + 14px)' });
  },

  setVisible(v) {
    this.visible = v && this.enabled;
    this.root.classList.toggle('hidden', !this.visible);
    this.root.classList.toggle('active', this.visible);
    if (!this.visible) this.releaseAll();
  },

  startEdit() {
    this.editing = true;
    this.root.classList.remove('hidden');
    this.root.classList.add('active', 'editing');
    $('editBar').classList.remove('hidden');
  },
  endEdit() {
    this.editing = false;
    this.root.classList.remove('editing');
    $('editBar').classList.add('hidden');
    saveSettings();
    this.setVisible(false);
    this.onEditDone?.();
  },

  releaseAll() {
    this.ptrs.clear();
    this.dir = { left: false, right: false, up: false, down: false };
    this.jump = this.fire = false;
    this.knob.style.transform = '';
    this.bJump.classList.remove('on');
    this.bFire.classList.remove('on');
  },

  center(el) {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  },

  /** Ku ktorému ovládaču patrí dotyk? */
  classify(x, y) {
    const p = this.center(this.pad);
    if (Math.hypot(x - p.x, y - p.y) < p.r * 1.5 || x < innerWidth * 0.42) return 'pad';
    const j = this.center(this.bJump);
    const f = this.center(this.bFire);
    return Math.hypot(x - j.x, y - j.y) < Math.hypot(x - f.x, y - f.y) ? 'jump' : 'fire';
  },

  onDown(e) {
    if (e.target.closest('#editBar')) return;
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch { /* niektoré prehliadače */ }
    if (this.editing) {
      const el = e.target.closest('.tc');
      if (el) this.ptrs.set(e.pointerId, { drag: el, key: el === this.pad ? 'pad' : 'btns' });
      return;
    }
    const kind = this.classify(e.clientX, e.clientY);
    this.ptrs.set(e.pointerId, { kind });
    this.update(e.pointerId, e.clientX, e.clientY);
  },

  onMove(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.drag) {
      settings.touch[p.key] = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
      this.applyLayout();
      return;
    }
    if (p.kind !== 'pad') p.kind = this.classify(e.clientX, e.clientY) === 'pad' ? p.kind : this.classify(e.clientX, e.clientY);
    this.update(e.pointerId, e.clientX, e.clientY);
  },

  onUp(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    this.recompute();
  },

  update(id, x, y) {
    const p = this.ptrs.get(id);
    p.x = x; p.y = y;
    this.recompute();
  },

  /** Prepočíta stav zo všetkých aktívnych prstov. */
  recompute() {
    const dir = { left: false, right: false, up: false, down: false };
    let jump = false;
    let fire = false;
    let knob = '';
    for (const p of this.ptrs.values()) {
      if (p.kind === 'pad') {
        const c = this.center(this.pad);
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist > c.r * 0.22) {
          // 8 smerov – výseky po 45°
          const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
          dir.right = [7, 0, 1].includes(sector);
          dir.down = [1, 2, 3].includes(sector);
          dir.left = [3, 4, 5].includes(sector);
          dir.up = [5, 6, 7].includes(sector);
        }
        const k = Math.min(dist, c.r * 0.6) / (dist || 1);
        knob = `translate(${dx * k}px, ${dy * k}px)`;
      } else if (p.kind === 'jump') jump = true;
      else if (p.kind === 'fire') fire = true;
    }
    this.dir = dir;
    this.jump = jump;
    this.fire = fire;
    this.knob.style.transform = knob;
    this.bJump.classList.toggle('on', jump);
    this.bFire.classList.toggle('on', fire);
  },

  /** Zlúči dotykový stav do spoločného vstupu. */
  merge(s) {
    if (!this.visible || this.editing) return;
    s.left ||= this.dir.left;
    s.right ||= this.dir.right;
    s.up ||= this.dir.up;
    s.down ||= this.dir.down;
    s.jump ||= this.jump;
    s.fire ||= this.fire;
    if (this.pausePressed) { s.pause = true; this.pausePressed = false; }
  },
};
