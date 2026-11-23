// HEEL TURN room server. One room type "ring": two wrestler slots. Clients send inputs; the server
// runs shared/sim.js at 30 Hz and broadcasts a snapshot plus that tick's events. An empty slot is
// driven by the scripted AI.
import { Server, Room } from 'colyseus';
import { createMatch, step, snapshot, newControl, INPUTS, ROSTER, INTRO_SECS } from '../shared/sim.js';
import { appendFacts, refreshSoon, rosterIds } from './memory.js';
import { RoyalRoom } from './royal-room.js';

const TICK_MS = 1000 / 30;
const WAIT_FOR_RIVAL_MS = 30000; // an online host waits this long for the invite link before the AI fills slot 2

class RingRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    // The shell makes short room codes (invite links carry them); use one as the room id when given.
    if (typeof options.roomId === 'string' && /^[A-Z0-9]{4,12}$/.test(options.roomId)) this.roomId = options.roomId;
    this.match = createMatch(options.p1, options.p2);
    this.ctl = [newControl(false), newControl(false)];
    this.slots = [null, null]; // sessionId per wrestler slot
    this.waitUntil = Date.now() + WAIT_FOR_RIVAL_MS;
    this.match.events.push({ k: 'call', text: 'Waiting for a rival. Send them the invite link.' });
    this.onMessage('in', (client, msg) => {
      const slot = this.slots.indexOf(client.sessionId);
      if (slot < 0 || !msg || typeof msg !== 'object') return;
      const c = this.ctl[slot];
      if (msg.k === 'move') { c.mx = clampAxis(msg.x); c.mz = clampAxis(msg.z); c.run = !!msg.run; }
      else if (msg.k === 'act' && INPUTS.includes(msg.a) && c.queue.length < 8) c.queue.push(msg.a);
      else if (msg.k === 'rematch' && this.match.over) this.match = createMatch(this.match.w[0].id, this.match.w[1].id, this.match.habits);
    });
    this.setSimulationInterval((dtMs) => this.tick(Math.min(dtMs / 1000, 0.05)), TICK_MS);
  }

  onJoin(client, options = {}) {
    const slot = this.slots.indexOf(null);
    this.slots[slot] = client.sessionId;
    this.ctl[slot] = newControl(true);
    // The rival arriving starts a fresh match (with intro), whatever the AI was doing in slot 2.
    if (slot === 1) {
      const m = this.match;
      this.match = createMatch(m.w[0].id, ROSTER[options.pick] ? options.pick : m.w[1].id, m.habits);
      this.waitUntil = 0;
    }
    this.match.events.push({ k: 'call', text: `${this.match.w[slot].name} is in the building (player ${slot + 1}).` });
  }

  // A dropped tab (sleep, network blip, a busy laptop) keeps its slot for 20 s and stands still meanwhile.
  onDrop(client) {
    const slot = this.slots.indexOf(client.sessionId);
    if (slot >= 0) { this.ctl[slot].mx = 0; this.ctl[slot].mz = 0; }
    this.allowReconnection(client, 20);
  }

  onLeave(client) {
    const slot = this.slots.indexOf(client.sessionId);
    if (slot < 0) return;
    this.slots[slot] = null;
    this.ctl[slot] = newControl(false);
    this.match.events.push({ k: 'call', text: `${this.match.w[slot].name}'s player left. The AI takes over.` });
  }

  tick(dt) {
    const waiting = !this.slots[1] && Date.now() < this.waitUntil;
    if (waiting) this.match.introT = INTRO_SECS; // hold the intro until the rival joins or the wait ends
    else step(this.match, dt, this.ctl);
    this.remember();
    this.broadcast('s', { ...snapshot(this.match), waiting, ev: this.match.events, slots: this.slots });
    this.match.events = [];
  }
}

// Sim facts -> Bruin events (one match id per sim match); the refresh runs between matches, off the tick.
RingRoom.prototype.remember = function remember() {
  const m = this.match, facts = m.events.filter((e) => e.k === 'fact');
  if (!m.memId) m.memId = 'm' + Date.now().toString(36);
  if (facts.length) {
    try { appendFacts(m.memId, facts, rosterIds(m.w.map((w) => w.id), this.ctl.map((c) => c.human))); }
    catch (e) { console.warn('[memory] append failed', e.message); }
  }
  if (m.events.some((e) => e.k === 'end')) refreshSoon();
};

function clampAxis(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; }

const port = Number(process.env.PORT || 2567);
const server = new Server();
server.define('ring', RingRoom);
server.define('royal', RoyalRoom); // OVER THE TOP battle royal
await server.listen(port);
console.log(`HEEL TURN server on ws://localhost:${port}`);
