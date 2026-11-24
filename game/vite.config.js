import memoryPlugin from './server/memory-plugin.js';

// one proxy table for dev (5173) and the production preview (4173), so the built game reaches the same services
const proxy = {
  '/agents': { target: `http://localhost:${process.env.HEEL_AGENTS_PORT || 8788}`, rewrite: (p) => p.replace(/^\/agents/, '') },
  '/voice/api': { target: `http://localhost:${process.env.HEEL_VOICE_PORT || 8787}` },
};

// Dev: /mem -> Bruin memory (plugin), /agents -> python -m agents.server (8788), /voice/api -> voice/server.js (8787).
export default {
  build: { target: 'esnext' },
  plugins: [memoryPlugin()],
  server: {
    fs: { allow: ['..'] }, // the booth imports ../voice/*.js
    proxy,
  },
  preview: { proxy },
};
