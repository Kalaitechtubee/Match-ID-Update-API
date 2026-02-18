const express = require('express');
const router = express.Router();
const matchController = require('../controllers/match.controller');
const liveController = require('../controllers/live.controller');

// ════════════════════════════════════════════════════════════════
// 🚀 INTELLIGENT LIVE ENDPOINTS (NEW MCP FLOW)
// ════════════════════════════════════════════════════════════════

// Main endpoint — auto-discovers, selects, validates, returns live data
router.get('/cricbuzz/live', liveController.getLiveMatch);

// Engine diagnostics — shows active match, continuity state
router.get('/cricbuzz/live/status', liveController.getEngineStatus);

// Discover all matches — shows all found matches with priorities
router.get('/cricbuzz/live/discover', liveController.discoverAll);

// Reset engine — clears cache and active match state
router.post('/cricbuzz/live/reset', liveController.resetEngine);

// ════════════════════════════════════════════════════════════════
// 📡 LEGACY ENDPOINTS (kept for backward compatibility)
// ════════════════════════════════════════════════════════════════

// Direct Cricbuzz proxy (manual matchId)
router.get('/cricbuzz/:matchId', matchController.proxyCricbuzz);

module.exports = router;
