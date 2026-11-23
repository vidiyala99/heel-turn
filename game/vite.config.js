import memoryPlugin from './server/memory-plugin.js';

// Dev: /mem -> Bruin memory (plugin), /agents -> python -m agents.server (8788), /voice/api -> voice/server.js (8787).
export default {
  build: { target: 'esnext' },
  plugins: [memoryPlugin()],
  server: {
    fs: { allow: ['..'] }, // the booth imports ../voice/*.js
    proxy: {
      '/agents': { target: `http://localhost:${process.env.HEEL_AGENTS_PORT || 8788}`, rewrite: (p) => p.replace(/^\/agents/, '') },
      '/voice/api': { target: `http://localhost:${process.env.HEEL_VOICE_PORT || 8787}` },
    },
  },
};
