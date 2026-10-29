// Označí sprite ako „sieťový“: dostane unikátne ID a index textúry, podľa ktorých ho
// hostiteľ pošle v snapshote. Origin a hĺbka vykreslenia sa nastavia z tabuľky NET_TEX,
// aby sprite vyzeral rovnako u hostiteľa aj u klienta.
import { NET_TEX, TEX_INDEX } from '../config.js';

export function netify(scene, sprite, key) {
  const idx = TEX_INDEX[key];
  sprite.nid = scene.nextNid++;
  sprite.tex = idx;
  const [, ox, oy, depth] = NET_TEX[idx];
  sprite.setOrigin(ox, oy).setDepth(depth);
  return sprite;
}

/** Zakóduje sprite do poľa pre snapshot. */
export function encodeSprite(o) {
  let flags = 0;
  if (o.flipX) flags |= 1;
  if (o.flipY) flags |= 2;
  if (o.alpha < 0.6) flags |= 4;
  if (o.isTinted && o.tintFill) flags |= 8;
  if (!o.visible) flags |= 16;
  const f = o.frame && typeof o.frame.name === 'number' ? o.frame.name : Number(o.frame?.name) || 0;
  return [o.nid, o.tex, f, Math.round(o.x), Math.round(o.y), flags, Math.round(o.angle)];
}
