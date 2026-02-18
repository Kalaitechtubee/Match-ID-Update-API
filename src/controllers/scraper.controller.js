const scraperService = require('../services/scraper.service');

exports.getAllMatches = async (req, res) => {
    try {
        const urls = [
            { url: 'https://www.cricbuzz.com/cricket-match/live-scores', type: 'live' },
            { url: 'https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches', type: 'upcoming' },
            { url: 'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches', type: 'recent' }
        ];

        const allMatches = [];

        for (const urlConfig of urls) {
            try {
                const matches = await scraperService.scrapeMatchesFromUrl(urlConfig.url, urlConfig.type);
                allMatches.push(...matches);
            } catch (error) {
                console.error(`Error scraping ${urlConfig.type}:`, error.message);
            }
        }

        const uniqueMatches = allMatches.filter((match, index, self) =>
            index === self.findIndex(m => m.match_id === match.match_id)
        );

        const typeOrder = { 'live': 1, 'upcoming': 2, 'recent': 3 };
        uniqueMatches.sort((a, b) => typeOrder[a.match_type] - typeOrder[b.match_type]);

        res.json({
            success: true,
            total_count: uniqueMatches.length,
            live_count: uniqueMatches.filter(m => m.match_type === 'live').length,
            upcoming_count: uniqueMatches.filter(m => m.match_type === 'upcoming').length,
            recent_count: uniqueMatches.filter(m => m.match_type === 'recent').length,
            matches: uniqueMatches
        });
    } catch (error) {
        console.error('Error in getAllMatches:', error);
        res.status(500).json({ success: false, error: 'Failed to scrape all matches', message: error.message });
    }
};

exports.getLiveMatches = async (req, res) => {
    try {
        const matches = await scraperService.scrapeMatchesFromUrl('https://www.cricbuzz.com/cricket-match/live-scores', 'live');
        res.json({ success: true, count: matches.length, matches });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to scrape live matches', message: error.message });
    }
};

exports.getUpcomingMatches = async (req, res) => {
    try {
        const matches = await scraperService.scrapeMatchesFromUrl('https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches', 'upcoming');
        res.json({ success: true, count: matches.length, matches });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to scrape upcoming matches', message: error.message });
    }
};

exports.getRecentMatches = async (req, res) => {
    try {
        const matches = await scraperService.scrapeMatchesFromUrl('https://www.cricbuzz.com/cricket-match/live-scores/recent-matches', 'recent');
        res.json({ success: true, count: matches.length, matches });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to scrape recent matches', message: error.message });
    }
};

exports.getMatchDetails = async (req, res) => {
    const { matchId } = req.params;
    try {
        const matchDetails = await scraperService.scrapeMatchDetails(matchId);
        res.json({ success: true, match_details: matchDetails });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to scrape match details', message: error.message, match_id: matchId });
    }
};

exports.getAllSeries = async (req, res) => {
    try {
        const series = await scraperService.scrapeSeries();
        res.json({ success: true, count: series.length, series });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to scrape series', message: error.message });
    }
};
