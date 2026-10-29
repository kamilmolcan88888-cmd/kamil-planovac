// Vstupný bod: Phaser konfigurácia, pixel-perfect škálovanie, iOS nastavenia.
import Phaser from 'phaser';
import './style.css';
import { W, H, PHYS } from './config.js';
import { settings } from './settings.js';
import { controls } from './input/Controls.js';
import { touch } from './input/Touch.js';
import { lockGestures, unlockAudioOnFirstGesture, registerSW, isPortrait } from './platform/ios.js';
import { BootScene } from './scenes/Boot.js';
import { MenuScene } from './scenes/Menu.js';
import { LobbyScene } from './scenes/Lobby.js';
import { GameScene } from './scenes/Game.js';
import { HudScene } from './scenes/Hud.js';
import { PauseScene, GameOverScene, VictoryScene, SettingsScene } from './scenes/Overlays.js';

lockGestures();
unlockAudioOnFirstGesture();
registerSW();
touch.init();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#0b0e1a',
  pixelArt: true,          // bez vyhladzovania
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  audio: { noAudio: true }, // zvuk riešime vlastným Web Audio enginom
  input: { activePointers: 4 },
  fps: { target: 60 },
  physics: { default: 'arcade', arcade: { gravity: { y: PHYS.gravity }, debug: false } },
  scene: [BootScene, MenuScene, LobbyScene, GameScene, HudScene, PauseScene, GameOverScene, VictoryScene, SettingsScene],
});

// vstup sa číta raz za snímku, pred update() všetkých scén
game.events.on(Phaser.Core.Events.PRE_STEP, () => controls.poll());

/**
 * Pixel-perfect škálovanie: celý násobok vo FYZICKÝCH pixeloch displeja.
 * iPhone 11 (828×1792, DPR 2) na šírku → 3× → 1440×810 px → ostré pixely.
 * V nastaveniach sa dá prepnúť na „celá obrazovka“ (neceločíselné, roztiahne sa).
 */
function fit() {
  const canvas = game.canvas;
  if (!canvas) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  let z;
  const free = Math.min(vw / W, vh / H);
  if (settings.pixelPerfect) {
    z = Math.floor(Math.min((vw * dpr) / W, (vh * dpr) / H)) / dpr;
    if (z <= 0 || z * W < vw * 0.6) z = free;  // malé okno → radšej vyplniť
  } else z = free;
  canvas.style.width = `${Math.round(W * z)}px`;
  canvas.style.height = `${Math.round(H * z)}px`;
  game.scale.refresh();
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 300));
game.events.once(Phaser.Core.Events.READY, fit);

// pri otočení na výšku hru pozastavíme (v singleplayeri)
window.addEventListener('resize', () => {
  if (!isPortrait()) return;
  const g = game.scene.getScene('Game');
  if (g && g.sys.isActive() && g.mode === 'single') g.openPause();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const g = game.scene.getScene('Game');
  if (g && g.sys.isActive() && g.mode === 'single') g.openPause();
});

window.__game = game; // pomôcka na ladenie v konzole
