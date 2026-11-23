// OVER THE TOP room: up to two humans join one battle royal with the AIs. The server runs shared/royal.js at 30 Hz and
// broadcasts a snapshot plus that tick's events. Player 1 is the commissioner: { k: 'verdict', id, decision }.
import { Room } from 'colyseus';
import { createRoyal, stepRoyal, snapshotRoyal, verdict } from '../shared/royal.js';
import { newControl, INPUTS, ROSTER, INTRO_SECS } from '../shared/sim.js';

const TICK_MS = 1000 / 30;
const WAIT_FOR_RIVAL_MS = 30000;

export class RoyalRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    if (typeof options.roomId === 'string' && /^[A-Z0-9]{4,12}$/.test(options.roomId)) this.roomId = options.roomId;
    this.picks = [ROSTER[options.p1] ? options.p1 : 'kane', null];
    this.slots = [null, null]; // sessionId per human slot (wrestler slots 0 and 1)
    this.fresh();
    this.waitUntil = Date.now() + WAIT_FOR_RIVAL_MS;
    this.onMessage('in', (client, msg) => {
      const slot = this.slots.indexOf(client.sessionId);
      if (slot < 0 || !msg || typeof msg !== 'object') return;
      const c = this.ctl[slot];
      if (msg.k === 'move') { c.mx = clampAxis(msg.x); c.mz = clampAxis(msg.z); c.run = !!msg.run; }
      else if (msg.k === 'act' && INPUTS.includes(msg.a) && c.queue.length < 8) c.queue.push(msg.a);
      else if (msg.k === 'verdict' && slot === 0 && typeof msg.id === 'string') verdict(this.match, msg.id, msg.decision === 'approve' ? 'approve' : 'block');
      else if (msg.k === 'rematch' && this.match.over) this.fresh();
    });
    this.setSimulationInterval((dtMs) => this.tick(Math.min(dtMs / 1000, 0.05)), TICK_MS);
  }

  // Two human slots (the second plays itself until a rival joins); the rest of the card is AI.
  fresh() {
    const humans = this.picks[1] ? this.picks : [this.picks[0], this.picks[0] === 'mae' ? 'vex' : 'mae'];
    this.match = createRoyal({ humans });
    this.ctl = this.match.w.map((_, i) => newControl(i < 2 && !!this.slots[i]));
  }

  onJoin(client, options = {}) {
    const slot = this.slots.indexOf(null);
    this.slots[slot] = client.sessionId;
    if (slot === 1) {
      this.picks[1] = ROSTER[options.pick] && options.pick !== this.picks[0] ? options.pick : (this.picks[0] === 'mae' ? 'vex' : 'mae');
      this.fresh(); this.waitUntil = 0;
    }
    this.ctl[slot] = newControl(true);
    this.match.events.push({ k: 'call', text: `${this.match.w[slot].name} is in the building (player ${slot + 1}).` });
  }

  onDrop(client) {
    const slot = this.slots.indexOf(client.sessionId);
    if (slot >= 0) { this.ctl[slot].mx = 0; this.ctl[slot].mz = 0; }
    this.allowReconnection(client, 20);
  }

  onLeave(client) {
    const slot = this.slots.indexOf(client.sessionId);
    if (slot < 0) return;
    this.slots[slot] = null; this.ctl[slot] = newControl(false);
    this.match.events.push({ k: 'call', text: `${this.match.w[slot].name}'s player left. The AI takes over.` });
  }

  tick(dt) {
    const waiting = !this.slots[1] && Date.now() < this.waitUntil;
    if (waiting) this.match.introT = INTRO_SECS;
    else stepRoyal(this.match, dt, this.ctl);
    this.broadcast('s', { ...snapshotRoyal(this.match), waiting, ev: this.match.events, slots: this.slots });
    this.match.events = [];
  }
}

function clampAxis(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; }
