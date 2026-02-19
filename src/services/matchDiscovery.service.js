const axios = require('axios');
const scraperService = require('./scraper.service');

// ════════════════════════════════════════════════════════════════
// 🏏 MATCH DISCOVERY ENGINE
// ════════════════════════════════════════════════════════════════
// Source A: Cricbuzz Live API (fast, structured, real matchIds)
// Source B: Puppeteer Scraper (fallback if API fails)
// Rule: if live API works → use it, else → use scraper
// ════════════════════════════════════════════════════════════════

const CRICBUZZ_API = {
    LIVE_MATCHES: 'https://m.cricbuzz.com/api/home',
    COMMENTARY: (matchId) => `https://m.cricbuzz.com/api/mcenter/comm/${matchId}`,
    SCORECARD: (matchId) => `https://www.cricbuzz.com/api/cricket-match/${matchId}/full-scorecard`,
    MATCH_INFO: (matchId) => `https://m.cricbuzz.com/api/mcenter/${matchId}`,
};

const HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'CricbuzzAndroid/6.15.03',
    'Referer': 'https://m.cricbuzz.com/',
    'Accept-Language': 'en-US,en;q=0.9',
};

// In-memory cache for discovered matches (avoids hammering the API)
let discoveryCache = {
    matches: [],
    timestamp: 0,
    source: null,
};

const CACHE_TTL = 60 * 1000; // 60 seconds cache for discovery

// ────────────────────────────────────────────────────
// SOURCE A: Cricbuzz Live API Discovery
// ────────────────────────────────────────────────────
async function discoverFromAPI() {
    try {
        console.log('🔍 [Discovery] Trying Cricbuzz Mobile API...');

        const response = await axios.get(CRICBUZZ_API.LIVE_MATCHES, {
            headers: HEADERS,
            timeout: 8000,
        });

        const data = response.data;
        const matches = [];

        // Parse the Mobile API response — matches is an array of objects with a 'match' property
        const rawMatches = data?.matches || [];

        for (const rawMatch of rawMatches) {
            const matchObj = rawMatch.match;
            if (!matchObj) continue;

            const matchInfo = matchObj.matchInfo || {};
            const matchScore = matchObj.matchScore || {};

            const matchId = matchInfo.matchId;
            if (!matchId) continue;

            const team1 = matchInfo.team1 || {};
            const team2 = matchInfo.team2 || {};
            const state = matchInfo.state || ''; // "In Progress", "Complete", "Preview", "Delay"
            const status = matchInfo.status || '';
            const matchDesc = matchInfo.matchDesc || '';
            const matchFormat = matchInfo.matchFormat || '';
            const seriesName = matchInfo.seriesName || 'Unknown Series';

            matches.push({
                matchId: String(matchId),
                team1: {
                    id: team1.teamId,
                    name: team1.teamName || 'Unknown',
                    shortName: team1.teamSName || '',
                },
                team2: {
                    id: team2.teamId,
                    name: team2.teamName || 'Unknown',
                    shortName: team2.teamSName || '',
                },
                matchType: matchInfo.matchType || 'Unknown',
                matchFormat,
                matchDesc,
                seriesName,
                seriesId: matchInfo.seriesId || null,
                state,
                status,
                venue: matchInfo.venueInfo?.ground || '',
                city: matchInfo.venueInfo?.city || '',
                isLive: ['In Progress', 'Toss', 'Innings Break', 'Strategic Timeout', 'Drinks', 'Delay', 'Rain', 'Wet Outfield', 'Stumps', 'Lunch', 'Tea', 'Bad Light'].includes(state),
                isComplete: state === 'Complete' || status?.toLowerCase().includes('won by') || status?.toLowerCase().includes('won by innings') || status?.toLowerCase().includes('match drawn'),
                team1Score: matchScore.team1Score || {},
                team2Score: matchScore.team2Score || {},
                startDate: matchInfo.startDate ? Number(matchInfo.startDate) : null,
                source: 'api',
            });
        }

        console.log(`✅ [Discovery] API found ${matches.length} total matches (${matches.filter(m => m.isLive).length} live)`);
        return { success: true, matches, source: 'api' };

    } catch (error) {
        console.error(`❌ [Discovery] API failed: ${error.message}`);
        return { success: false, matches: [], source: 'api', error: error.message };
    }
}

// ────────────────────────────────────────────────────
// SOURCE B: Puppeteer Scraper Discovery (fallback)
// ────────────────────────────────────────────────────
async function discoverFromScraper() {
    try {
        console.log('🔍 [Discovery] Falling back to Puppeteer scraper...');

        const scrapedMatches = await scraperService.scrapeMatchesFromUrl(
            'https://www.cricbuzz.com/cricket-match/live-scores',
            'live'
        );

        const matches = scrapedMatches.map(m => ({
            matchId: String(m.match_id),
            team1: {
                name: m.teams?.split(' vs ')?.[0] || 'Unknown',
                shortName: m.teams?.split(' vs ')?.[0] || '',
            },
            team2: {
                name: m.teams?.split(' vs ')?.[1] || 'Unknown',
                shortName: m.teams?.split(' vs ')?.[1] || '',
            },
            matchType: 'Unknown',
            matchFormat: '',
            matchDesc: '',
            seriesName: m.series || 'Unknown Series',
            seriesId: null,
            state: m.status === 'Live' ? 'In Progress' : m.status,
            status: m.status || '',
            venue: m.venue || '',
            city: '',
            isLive: m.match_type === 'live' || m.status === 'Live',
            isComplete: m.status?.toLowerCase().includes('won') || false,
            team1Score: {},
            team2Score: {},
            startDate: null,
            source: 'scraper',
        }));

        console.log(`✅ [Discovery] Scraper found ${matches.length} matches`);
        return { success: true, matches, source: 'scraper' };

    } catch (error) {
        console.error(`❌ [Discovery] Scraper also failed: ${error.message}`);
        return { success: false, matches: [], source: 'scraper', error: error.message };
    }
}

// ────────────────────────────────────────────────────
// MAIN DISCOVERY FUNCTION (with caching)
// ────────────────────────────────────────────────────
async function discoverMatches(forceRefresh = false) {
    const now = Date.now();

    // Return cached if still fresh
    if (!forceRefresh && discoveryCache.matches.length > 0 && (now - discoveryCache.timestamp) < CACHE_TTL) {
        console.log(`📦 [Discovery] Using cached data (${discoveryCache.matches.length} matches, source: ${discoveryCache.source}, age: ${Math.round((now - discoveryCache.timestamp) / 1000)}s)`);
        return {
            success: true,
            matches: discoveryCache.matches,
            source: discoveryCache.source,
            cached: true,
        };
    }

    // Try Source A first (Cricbuzz API)
    let result = await discoverFromAPI();

    // If API failed or returned 0 matches, try Source B (Scraper)
    if (!result.success || result.matches.length === 0) {
        console.log('⚠️ [Discovery] API returned no results, trying scraper...');
        result = await discoverFromScraper();
    }

    // 🏆 T20 WORLD CUP ONLY FILTER
    // As per requirement: Only scrape and display T20 World Cup matches
    if (result.success && result.matches.length > 0) {
        console.log('🏟️ [Discovery] Applying T20 World Cup strict filter...');
        result.matches = result.matches.filter(m => {
            const series = (m.seriesName || '').toLowerCase();
            const desc = (m.matchDesc || '').toLowerCase();
            const allText = `${series} ${desc}`.toLowerCase();

            // Check for T20 World Cup keywords
            const isT20WC = (allText.includes('t20') && allText.includes('world cup')) ||
                allText.includes('men\'s t20 wc') ||
                allText.includes('t20wc');

            return isT20WC;
        });
        console.log(`🏟️ [Discovery] Filter complete. Found ${result.matches.length} T20 World Cup matches.`);
    }

    // Update cache
    if (result.success && result.matches.length > 0) {
        discoveryCache = {
            matches: result.matches,
            timestamp: now,
            source: result.source,
        };
    }

    return result;
}

// ────────────────────────────────────────────────────
// FETCH COMMENTARY DATA FOR A MATCH
// ────────────────────────────────────────────────────
async function fetchCommentary(matchId) {
    try {
        const response = await axios.get(CRICBUZZ_API.COMMENTARY(matchId), {
            headers: HEADERS,
            timeout: 8000,
        });
        return { success: true, data: response.data };
    } catch (error) {
        console.error(`❌ [Commentary] Failed for matchId ${matchId}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ────────────────────────────────────────────────────
// FETCH MATCH INFO
// ────────────────────────────────────────────────────
async function fetchMatchInfo(matchId) {
    try {
        const response = await axios.get(CRICBUZZ_API.MATCH_INFO(matchId), {
            headers: HEADERS,
            timeout: 8000,
        });
        return { success: true, data: response.data };
    } catch (error) {
        console.error(`❌ [MatchInfo] Failed for matchId ${matchId}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ────────────────────────────────────────────────────
// CLEAR CACHE (for testing/manual reset)
// ────────────────────────────────────────────────────
function clearCache() {
    discoveryCache = { matches: [], timestamp: 0, source: null };
    console.log('🗑️ [Discovery] Cache cleared');
}

module.exports = {
    discoverMatches,
    discoverFromAPI,
    discoverFromScraper,
    fetchCommentary,
    fetchMatchInfo,
    clearCache,
    CRICBUZZ_API,
};
