const express = require('express');
const cors = require('cors');
const matchRoutes = require('./routes/match.routes');
const scraperRoutes = require('./routes/scraper.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', matchRoutes);
app.use('/api', scraperRoutes);

// Root route — API documentation
app.get('/', (req, res) => {
    res.status(200).json({
        message: "Cricket MCP — Dynamic Match Discovery Engine",
        status: "running",
        version: "3.0",
        architecture: {
            description: "Self-thinking match engine with zero DB dependency",
            layers: [
                "Layer 1 — Match Discovery (Cricbuzz API → Scraper fallback)",
                "Layer 2 — Priority Intelligence (India > IPL > ICC > International > Domestic)",
                "Layer 3 — Match Continuity Manager (no unnecessary switching)",
                "Layer 4 — Data Validation & Pipeline",
            ],
        },
        endpoints: {
            intelligent: {
                live: "GET /api/cricbuzz/live — Auto-detect, select & return live match data",
                status: "GET /api/cricbuzz/live/status — Engine diagnostics & active match info",
                discover: "GET /api/cricbuzz/live/discover — Show all discovered matches with priorities",
                reset: "POST /api/cricbuzz/live/reset — Reset engine state & cache",
            },
            legacy: {
                proxy: "GET /api/cricbuzz/:matchId — Direct Cricbuzz proxy (manual matchId)",
            },
            scraper: {
                all_matches: "GET /api/matches/all",
                live: "GET /api/matches/live",
                upcoming: "GET /api/matches/upcoming",
                recent: "GET /api/matches/recent",
                match_details: "GET /api/scrape/match/:matchId",
                series: "GET /api/series",
            },
        },
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        engine: 'Dynamic Match Discovery Engine v3.0',
        dbRequired: false,
        timestamp: new Date().toISOString(),
    });
});

module.exports = app;
