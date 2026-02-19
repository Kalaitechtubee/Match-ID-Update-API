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
                error: 'No T20 World Cup matches found from any source',
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

        // ──────── STEP 3: FETCH COMMENTARY DATA WITH ROBUST RETRIES ────────
        let commentaryResult;
        let retryCount = 0;
        const MAX_RETRIES = 2;

        while (retryCount <= MAX_RETRIES) {
            try {
                commentaryResult = await discoveryService.fetchCommentary(matchId);

                if (commentaryResult.success) {
                    // ──────── STEP 4: STRICT VALIDATION ────────
                    const validation = intelligenceService.validateCommentaryData(commentaryResult.data);

                    if (validation.valid) {
                        // Success! Update match state and return
                        if (validation.isComplete && !validation.isLive) {
                            const active = intelligenceService.getActiveMatch();
                            if (active.matchId === matchId) active.state = 'Complete';
                        }

                        const elapsed = Date.now() - startTime;
                        const activeMatch = intelligenceService.getActiveMatch();

                        return res.json({
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
                                },
                                continuity: resolution.continuity,
                                validation: {
                                    valid: true,
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
                    } else {
                        console.log(`⚠️ [Live] Data validation failed for ${matchId} (Attempt ${retryCount + 1}): ${validation.issues.join(', ')}`);
                    }
                }
            } catch (err) {
                console.log(`❌ [Live] Fetch error for ${matchId} (Attempt ${retryCount + 1}): ${err.message}`);
            }

            retryCount++;
            if (retryCount <= MAX_RETRIES) {
                const delay = 800 * retryCount; // Increasing backoff
                console.log(`⏳ [Live] Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));

                // On last retry, maybe try clearing discovery cache to see if matchId changed?
                if (retryCount === MAX_RETRIES) discoveryService.clearCache();
            }
        }

        // If we reach here, primary match failed even after retries. Try alternative ONE time.
        if (resolution.selection.alternatives?.length > 0) {
            console.log('⚠️ [Live] Primary match failed after retries, trying the next best alternative...');
            const altMatch = resolution.selection.alternatives[0];
            const altResult = await discoveryService.fetchCommentary(altMatch.matchId);

            if (altResult.success) {
                const altValidation = intelligenceService.validateCommentaryData(altResult.data);
                if (altValidation.valid) {
                    const altFull = discovery.matches.find(m => m.matchId === altMatch.matchId);
                    if (altFull) {
                        intelligenceService.setActiveMatch(altFull, 'Switched to alternative — primary failed validation multiple times');
                    }

                    const elapsed = Date.now() - startTime;
                    return res.json({
                        success: true,
                        matchId: altMatch.matchId,
                        data: altResult.data,
                        engine: {
                            discovery: { source: discovery.source, matchCount: discovery.matches.length },
                            intelligence: { switchedToAlternative: true },
                            responseTime: `${elapsed}ms`,
                        },
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }

        // Ultimate failure
        return res.status(502).json({
            success: false,
            error: 'Failed to retrieve valid match data after multiple attempts',
            matchId,
            engine: {
                discovery: { source: discovery.source, matchCount: discovery.matches.length },
                resolution: { matchId, reason: resolution.selection?.reason },
                retries: retryCount,
            },
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('❌ [Live] Unhandled error in Live Match Engine:', error);
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
