const discoveryService = require('../services/matchDiscovery.service');
const intelligenceService = require('../services/matchIntelligence.service');

// ════════════════════════════════════════════════════════════════
// 🚀 LIVE CONTROLLER — Intelligent Auto-Discovery Endpoint
// ════════════════════════════════════════════════════════════════
// GET /api/cricbuzz/live
//
// Flow:
//   Request → Discovery Engine → Priority Intelligence →
//   Continuity Manager → Validation Layer → Cricbuzz Commentary API →
//   Return live JSON
//
// No DB. No cron. No manual work.
// Always correct matchId. Always correct live data.
// ════════════════════════════════════════════════════════════════

exports.getLiveMatch = async (req, res) => {
    const startTime = Date.now();

    try {
        // ──────── STEP 1: DISCOVER MATCHES ────────
        const discovery = await discoveryService.discoverMatches();

        if (!discovery.success || discovery.matches.length === 0) {
            return res.status(503).json({
                success: false,
                error: 'No cricket matches found from any source',
                engine: {
                    discovery: { source: discovery.source, matchCount: 0 },
                },
                timestamp: new Date().toISOString(),
            });
        }

        // ──────── STEP 2: INTELLIGENT MATCH RESOLUTION ────────
        const resolution = await intelligenceService.resolveMatch(discovery.matches);

        if (!resolution.success) {
            return res.status(404).json({
                success: false,
                error: resolution.error,
                details: resolution.details,
                timestamp: new Date().toISOString(),
            });
        }

        const matchId = resolution.matchId;

        // ──────── STEP 3: FETCH COMMENTARY DATA ────────
        let commentaryResult = await discoveryService.fetchCommentary(matchId);

        // If commentary fails, try fallback — retry once
        if (!commentaryResult.success) {
            console.log(`⚠️ [Live] Commentary failed for ${matchId}, retrying...`);
            await new Promise(r => setTimeout(r, 500));
            commentaryResult = await discoveryService.fetchCommentary(matchId);
        }

        // If still fails, try the next best match
        if (!commentaryResult.success && resolution.selection.alternatives?.length > 0) {
            console.log('⚠️ [Live] Primary match commentary unavailable, trying alternative...');
            const altMatch = resolution.selection.alternatives[0];
            commentaryResult = await discoveryService.fetchCommentary(altMatch.matchId);

            if (commentaryResult.success) {
                // Update active match to the alternative
                const altFull = discovery.matches.find(m => m.matchId === altMatch.matchId);
                if (altFull) {
                    intelligenceService.setActiveMatch(altFull, 'Switched to alternative — primary commentary unavailable');
                }
            }
        }

        if (!commentaryResult.success) {
            return res.status(502).json({
                success: false,
                error: 'Failed to fetch commentary data from Cricbuzz',
                matchId,
                engine: {
                    discovery: { source: discovery.source, matchCount: discovery.matches.length, cached: discovery.cached },
                    resolution: { matchId, reason: resolution.selection?.reason },
                },
                timestamp: new Date().toISOString(),
            });
        }

        // ──────── STEP 4: VALIDATE DATA ────────
        const validation = intelligenceService.validateCommentaryData(commentaryResult.data);

        // Update match state from commentary data
        if (validation.isComplete && !validation.isLive) {
            // Match just completed — mark for next refresh to switch
            const active = intelligenceService.getActiveMatch();
            if (active.matchId === matchId) {
                active.state = 'Complete';
            }
        }

        // ──────── STEP 5: RETURN INTELLIGENT RESPONSE ────────
        const elapsed = Date.now() - startTime;
        const activeMatch = intelligenceService.getActiveMatch();

        res.json({
            success: true,
            matchId,
            data: commentaryResult.data,
            engine: {
                discovery: {
                    source: discovery.source,
                    totalMatches: discovery.matches.length,
                    liveMatches: discovery.matches.filter(m => m.isLive).length,
                    cached: discovery.cached || false,
                },
                intelligence: {
                    selectedReason: resolution.selection?.reason,
                    priority: resolution.selection?.priority,
                    alternatives: resolution.selection?.alternatives || [],
                    allLiveCount: resolution.selection?.allLiveCount,
                },
                continuity: resolution.continuity,
                validation: {
                    valid: validation.valid,
                    issues: validation.issues,
                    matchState: validation.state,
                    isLive: validation.isLive,
                },
                activeMatch: {
                    matchId: activeMatch.matchId,
                    teams: `${activeMatch.team1?.name || '?'} vs ${activeMatch.team2?.name || '?'}`,
                    series: activeMatch.seriesName,
                    selectedAt: new Date(activeMatch.selectedAt).toISOString(),
                },
                responseTime: `${elapsed}ms`,
            },
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('❌ [Live] Unhandled error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error in Live Match Engine',
            details: error.message,
            timestamp: new Date().toISOString(),
        });
    }
};

// ────────────────────────────────────────────────────
// GET /api/cricbuzz/live/status — Engine status & diagnostics
// ────────────────────────────────────────────────────
exports.getEngineStatus = async (req, res) => {
    const activeMatch = intelligenceService.getActiveMatch();

    res.json({
        success: true,
        engine: {
            status: 'running',
            activeMatch: {
                matchId: activeMatch.matchId,
                teams: activeMatch.matchId
                    ? `${activeMatch.team1?.name || '?'} vs ${activeMatch.team2?.name || '?'}`
                    : 'None selected',
                series: activeMatch.seriesName || 'N/A',
                state: activeMatch.state || 'N/A',
                priority: activeMatch.priority,
                selectedAt: activeMatch.selectedAt
                    ? new Date(activeMatch.selectedAt).toISOString()
                    : 'N/A',
                switchReason: activeMatch.switchReason || 'N/A',
            },
            architecture: {
                layer1: 'Match Discovery (Cricbuzz API → Scraper fallback)',
                layer2: 'Priority Intelligence (India > IPL > ICC > International > Domestic)',
                layer3: 'Match Continuity Manager',
                layer4: 'Data Validation Layer',
            },
        },
        timestamp: new Date().toISOString(),
    });
};

// ────────────────────────────────────────────────────
// GET /api/cricbuzz/live/discover — Show all discovered matches
// ────────────────────────────────────────────────────
exports.discoverAll = async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const discovery = await discoveryService.discoverMatches(forceRefresh);

        if (!discovery.success) {
            return res.status(503).json({
                success: false,
                error: 'Discovery failed',
                details: discovery.error,
            });
        }

        // Add priority scores
        const enriched = discovery.matches.map(m => ({
            ...m,
            priority: intelligenceService.calculatePriority(m),
        }));

        // Sort by priority
        enriched.sort((a, b) => {
            // Live first
            if (a.isLive && !b.isLive) return -1;
            if (!a.isLive && b.isLive) return 1;
            // Then by priority
            return a.priority - b.priority;
        });

        res.json({
            success: true,
            source: discovery.source,
            cached: discovery.cached || false,
            totalMatches: enriched.length,
            liveMatches: enriched.filter(m => m.isLive).length,
            matches: enriched.map(m => ({
                matchId: m.matchId,
                team1: m.team1,
                team2: m.team2,
                seriesName: m.seriesName,
                matchType: m.matchType,
                matchFormat: m.matchFormat,
                matchDesc: m.matchDesc,
                state: m.state,
                status: m.status,
                isLive: m.isLive,
                isComplete: m.isComplete,
                priority: m.priority,
                venue: `${m.venue}${m.city ? ', ' + m.city : ''}`,
                startDate: m.startDate,
            })),
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

// ────────────────────────────────────────────────────
// POST /api/cricbuzz/live/reset — Reset engine state
// ────────────────────────────────────────────────────
exports.resetEngine = (req, res) => {
    intelligenceService.resetActiveMatch();
    discoveryService.clearCache();

    res.json({
        success: true,
        message: 'Engine state and cache have been reset',
        timestamp: new Date().toISOString(),
    });
};
