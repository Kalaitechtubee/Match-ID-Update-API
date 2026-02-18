const axios = require('axios');

// ════════════════════════════════════════════════════════════════
// 📡 MATCH CONTROLLER (DB-FREE)
// ════════════════════════════════════════════════════════════════
// Only keeps the Cricbuzz proxy for manual matchId usage.
// The old getMatchId / updateMatchId (DB-based) are REMOVED.
// Use /api/cricbuzz/live for intelligent auto-discovery.
// ════════════════════════════════════════════════════════════════

exports.proxyCricbuzz = async (req, res) => {
    try {
        const { matchId } = req.params;

        if (!matchId || isNaN(matchId)) {
            return res.status(400).json({
                error: 'Invalid matchId parameter',
                hint: 'Use GET /api/cricbuzz/live for auto-discovered live match',
            });
        }

        const response = await axios.get(`https://m.cricbuzz.com/api/mcenter/comm/${matchId}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://m.cricbuzz.com/',
            },
            timeout: 8000,
        });

        res.json(response.data);
    } catch (err) {
        console.error('Error fetching Cricbuzz data:', err.message);
        res.status(500).json({
            error: 'Failed to fetch Cricbuzz data',
            details: err.message,
            hint: 'Use GET /api/cricbuzz/live for auto-discovered live match',
        });
    }
};
