// Caméra façon simulation de vie : orbite autour d'un point, suivi d'un sim, vues quartier/aérienne/construction,
// et caméra à la troisième personne pour le contrôle direct.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';

export const CAM_MODES = {
  free: { name: 'Caméra libre', icon: '🎥' },
  follow: { name: 'Suivre le sim', icon: '🎯' },
  close: { name: 'Vue rapprochée', icon: '🔍' },
  neighborhood: { name: 'Vue de quartier', icon: '🏘️' },
  aerial: { name: 'Vue aérienne', icon: '🛩️' },
  build: { name: 'Vue construction', icon: '📐' },
  third: { name: 'Contrôle direct', icon: '🕹️' },
};

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 900);
    this.target = new THREE.Vector3(40, 0, 40);
    this.goal = this.target.clone();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.85;
    this.dist = 26;
    this.goalYaw = this.yaw; this.goalPitch = this.pitch; this.goalDist = this.dist;
    this.mode = 'free';
    this.followSim = null;
    this.bounds = { w: 96, h: 96 };
    this.update(0);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'close') { this.goalDist = 7; this.goalPitch = 0.45; }
    if (mode === 'follow') { this.goalDist = Math.min(this.goalDist, 18); }
    if (mode === 'neighborhood') { this.goalDist = 70; this.goalPitch = 0.95; }
    if (mode === 'aerial') { this.goalDist = 120; this.goalPitch = 1.35; }
    if (mode === 'build') { this.goalDist = Math.max(22, Math.min(this.goalDist, 40)); this.goalPitch = 1.05; }
    if (mode === 'third') { this.goalDist = 6.5; this.goalPitch = 0.38; }
    if (mode === 'free' && this.goalDist > 60) this.goalDist = 30;
  }

  pan(dx, dz) {
    // Déplacement relatif à l'orientation de la caméra.
    const s = Math.max(0.4, this.dist / 25);
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    this.goal.x += (dx * cos + dz * sin) * s;
    this.goal.z += (-dx * sin + dz * cos) * s;
    this.goal.x = clamp(this.goal.x, -10, this.bounds.w + 10);
    this.goal.z = clamp(this.goal.z, -10, this.bounds.h + 10);
    if (this.mode === 'follow' || this.mode === 'close') this.mode = 'free';
  }
  rotate(d) { this.goalYaw += d; }
  tilt(d) { this.goalPitch = clamp(this.goalPitch + d, 0.15, 1.45); }
  zoom(f) {
    this.goalDist = clamp(this.goalDist * f, this.mode === 'third' ? 3 : 3.5, 160);
  }
  focus(x, z, dist) { this.goal.set(x, 0, z); if (dist) this.goalDist = dist; }

  update(dt, followPos) {
    const k = 1 - Math.pow(0.0015, dt);
    if ((this.mode === 'follow' || this.mode === 'close' || this.mode === 'third') && followPos) {
      this.goal.set(followPos.x, followPos.y, followPos.z);
    }
    this.target.lerp(this.goal, dt ? k : 1);
    this.yaw = lerp(this.yaw, this.goalYaw, dt ? k : 1);
    this.pitch = lerp(this.pitch, this.goalPitch, dt ? k : 1);
    this.dist = lerp(this.dist, this.goalDist, dt ? k : 1);
    const lookY = this.target.y + (this.mode === 'third' || this.mode === 'close' ? 1.3 : 0.6);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      lookY + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target.x, lookY, this.target.z);
  }

  // Direction "avant" au sol (pour le contrôle direct : le stick pousse vers l'écran).
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
}
