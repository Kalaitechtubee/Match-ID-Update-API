// ════════════════════════════════════════════════════════════════
// 🧠 MATCH INTELLIGENCE SERVICE
// ════════════════════════════════════════════════════════════════
// Layer 2: Smart Match Selection (Priority Engine)
// Layer 3: Match Continuity Manager (don't switch needlessly)
// Layer 4: Data Validation (ensure data is real & valid)
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────
// IN-MEMORY STATE (replaces DB entirely)
// ────────────────────────────────────────────────────
let activeMatch = {
    matchId: null,
    selectedAt: 0,
    state: null,        // 'In Progress', 'Complete', 'Innings Break'
    team1: null,
    team2: null,
    seriesName: null,
    priority: Infinity,
    switchReason: null,
};

// ────────────────────────────────────────────────────
// INTEREST WEIGHTING ENGINE
// ────────────────────────────────────────────────────
function getStateWeight(match) {
    if (!match) return 0;
    const state = match.state || '';

    // 1. Actually playing is top priority (Includes Innings Break, drinks, etc)
    const isPlaying = match.isLive && !['Toss', 'Preview'].includes(state);
    if (isPlaying) return 100;

    // 2. Completed is high priority (Show final score)
    if (match.isComplete) return 90;

    // 3. Toss is next (Just before start)
    if (state === 'Toss') return 80;

    // 4. Preview/Upcoming
    return 50;
}

// How long to keep using the same match before re-evaluating
const CONTINUITY_WINDOW = 30 * 1000; // 30 seconds

// ────────────────────────────────────────────────────
// PRIORITY ENGINE
// ────────────────────────────────────────────────────
// 1️⃣ India match
// 2️⃣ IPL match
// 3️⃣ ICC tournament (World Cup, Champions Trophy, WTC)
// 4️⃣ International match
// 5️⃣ Domestic / League
// 6️⃣ First available live match
// ────────────────────────────────────────────────────

const INDIA_KEYWORDS = ['india', 'ind', 'bcci'];

const IPL_KEYWORDS = [
    'indian premier league', 'ipl', 'tata ipl',
];

const ICC_KEYWORDS = [
    'icc', 'world cup', 'champions trophy', 'world test championship',
    'wtc', 't20 world cup', 'odi world cup', 'cwc',
];

const INTERNATIONAL_TYPES = ['international'];

function calculatePriority(match) {
    const team1Name = (match.team1?.name || '').toLowerCase();
    const team2Name = (match.team2?.name || '').toLowerCase();
    const team1Short = (match.team1?.shortName || '').toLowerCase();
    const team2Short = (match.team2?.shortName || '').toLowerCase();
    const seriesName = (match.seriesName || '').toLowerCase();
    const matchType = (match.matchType || '').toLowerCase();
    const matchDesc = (match.matchDesc || '').toLowerCase();

    const allText = `${team1Name} ${team2Name} ${team1Short} ${team2Short} ${seriesName} ${matchDesc}`;

    // Check if India is playing
    const isIndiaMatch = INDIA_KEYWORDS.some(kw =>
        team1Name.includes(kw) || team2Name.includes(kw) ||
        team1Short.includes(kw) || team2Short.includes(kw)
    );

    // Check if IPL
    const isIPL = IPL_KEYWORDS.some(kw => seriesName.includes(kw) || allText.includes(kw));

    // Check if ICC tournament
    const isICC = ICC_KEYWORDS.some(kw => seriesName.includes(kw) || allText.includes(kw));

    // Check International
    const isInternational = INTERNATIONAL_TYPES.some(t => matchType.includes(t));

    // Priority scoring (lower = higher priority)
    if (isICC && (seriesName.includes('t20') || allText.includes('t20'))) return 1; // T20 World Cup = TOP
    if (isIndiaMatch && isICC) return 2;            // India in ICC
    if (isIndiaMatch && isInternational) return 3;  // India international
    if (isIndiaMatch && isIPL) return 4;           // India in IPL
    if (isIndiaMatch) return 5;                      // India any match
    if (isIPL) return 6;                             // IPL (non-India)
    if (isICC) return 7;                             // Other ICC (ODI WC, WTC)
    if (isInternational) return 8;                   // International match
    if (matchType.includes('league')) return 9;       // Other leagues (BBL, PSL, etc)
    if (matchType.includes('women')) return 10;       // Women's matches
    return 11;                                        // Everything else (Domestic, etc)
}

// ────────────────────────────────────────────────────
// MATCH INTELLIGENCE SELECTOR
// ────────────────────────────────────────────────────
function selectBestMatch(matches) {
    if (!matches || matches.length === 0) {
        return { match: null, reason: 'No matches available' };
    }

    // Calculate priority for ALL discovered matches
    const allPrioritized = matches.map(m => {
        const priority = calculatePriority(m);
        return { ...m, priority };
    });

    // Strategy 1: If there is a Priority 1 match (T20 World Cup) available,
    // we pick it based on our interest weighting.
    const t20WorldCupMatches = allPrioritized.filter(m => m.priority === 1);
    if (t20WorldCupMatches.length > 0) {
        // Pick the best T20 match by interest level
        const bestT20 = t20WorldCupMatches.sort((a, b) => {
            const weightA = getStateWeight(a);
            const weightB = getStateWeight(b);

            if (weightA !== weightB) return weightB - weightA;

            // Otherwise, pick by start date (closest to now)
            const now = Date.now();
            return Math.abs((a.startDate || 0) - now) - Math.abs((b.startDate || 0) - now);
        })[0];

        return {
            match: bestT20,
            reason: `T20 World Cup Selection: ${bestT20.isComplete ? 'Final Score' : bestT20.isLive ? 'Live' : 'Preview'}`,
            priority: 1,
            allMatchCount: matches.length,
            isForced: true
        };
    }

    // General Logic: Sort ALL prioritized matches by a combination of Priority AND Interest Weight
    const sorted = [...allPrioritized].sort((a, b) => {
        const weightA = getStateWeight(a);
        const weightB = getStateWeight(b);

        // Core rule: A live/completed match with high priority always wins
        const aIsInteresting = weightA >= 90;
        const bIsInteresting = weightB >= 90;

        if (aIsInteresting && bIsInteresting) {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return weightB - weightA;
        }

        if (aIsInteresting && !bIsInteresting) return -1;
        if (!aIsInteresting && bIsInteresting) return 1;

        // If neither is "happening" yet, sort by priority then start date
        if (a.priority !== b.priority) return a.priority - b.priority;
        const now = Date.now();
        return Math.abs((a.startDate || 0) - now) - Math.abs((b.startDate || 0) - now);
    });

    const selected = sorted[0];

    const reasonMap = {
        1: 'T20 World Cup Match',
        2: 'India in ICC Tournament',
        3: 'India International',
        4: 'India in IPL',
        5: 'India match',
        6: 'IPL match',
        7: 'ICC Tournament',
        8: 'International match',
        9: 'League match',
        10: 'Women\'s match',
        11: 'Live match',
    };

    return {
        match: selected,
        reason: selected.isComplete ? `Final score: ${reasonMap[selected.priority] || selected.seriesName}` : reasonMap[selected.priority] || 'Best available cricket match',
        priority: selected.priority,
        allLiveCount: matches.filter(m => m.isLive).length,
        allMatchCount: matches.length,
        alternatives: sorted.slice(1, 4).map(m => ({
            matchId: m.matchId,
            teams: `${m.team1?.shortName || m.team1?.name} vs ${m.team2?.shortName || m.team2?.name}`,
            priority: m.priority,
            seriesName: m.seriesName,
        })),
    };
}

// ────────────────────────────────────────────────────
// MATCH CONTINUITY MANAGER
// ────────────────────────────────────────────────────
// Rules:
// 1. If same match still live → continue using it
// 2. If match completed → stay on it until next match ACTUALLY starts
// 3. If a higher priority match started → switch
// ────────────────────────────────────────────────────

function shouldSwitchMatch(currentActive, newBest, allMatches) {
    const now = Date.now();

    // No active match → definitely select one
    if (!currentActive.matchId) {
        return { shouldSwitch: true, reason: 'No active match, selecting first one' };
    }

    // CRITICAL: If new best is a T20 World Cup match (Priority 1) and current is something else
    // switch immediately if it's playing or completed.
    if (newBest && newBest.priority === 1 && currentActive.priority !== 1 && getStateWeight(newBest) >= 90) {
        return {
            shouldSwitch: true,
            reason: `Highly important result/match: Switching to ${newBest.team1?.name} vs ${newBest.team2?.name}`
        };
    }

    // Check if current match is still in the live list
    const currentInList = allMatches.find(m => m.matchId === currentActive.matchId);

    // If current match no longer exists in the list → switch
    if (!currentInList) {
        return { shouldSwitch: true, reason: 'Current match no longer in live list' };
    }

    // If current match completed -> check if we should switch
    if (currentInList.isComplete) {
        // We only switch away from a COMPLETED match if:
        // 1. There is a new match ACTUALLY PLAYING with EQUAL or HIGHER priority
        // 2. There is ANY match playing and the completed match is old (more than 2 mins)

        const playingMatch = allMatches.find(m => {
            const weight = getStateWeight(m);
            // Use calculatePriority as safety-net if priority not pre-set
            const mPriority = m.priority ?? calculatePriority(m);
            return weight >= 100 && m.matchId !== currentActive.matchId && mPriority <= currentActive.priority;
        });

        const anyPlayingMatch = allMatches.find(m => getStateWeight(m) >= 100 && m.matchId !== currentActive.matchId);
        const isOldResult = (now - (currentActive.selectedAt || 0)) > 2 * 60 * 1000;

        if (playingMatch) {
            return { shouldSwitch: true, reason: `Live match found: ${playingMatch.team1?.name} vs ${playingMatch.team2?.name}` };
        }

        if (anyPlayingMatch && isOldResult) {
            return { shouldSwitch: true, reason: `Switching to live match: ${anyPlayingMatch.team1?.name} vs ${anyPlayingMatch.team2?.name}` };
        }

        // Stay on completed match score until a new match actually starts playing
        return { shouldSwitch: false, reason: 'Displaying final score until next match starts playing' };
    }

    // If current match is still live → check priority
    if (currentInList.isLive) {
        // If it's just "Toss" or "Preview", we check if there's a recently completed match we missed
        const weight = getStateWeight(currentInList);
        if (weight < 90) { // It's Toss or Preview
            const betterRecentResult = allMatches.find(m => m.isComplete && m.priority <= currentActive.priority);
            if (betterRecentResult) {
                return { shouldSwitch: true, reason: `Preferring final score of ${betterRecentResult.team1?.name} until this match starts playing` };
            }
        }

        // If new best has MUCH higher priority (e.g. India started playing)
        if (newBest && newBest.priority < currentActive.priority - 2 && getStateWeight(newBest) >= 100) {
            return {
                shouldSwitch: true,
                reason: `Higher priority match started: ${newBest.team1?.name} vs ${newBest.team2?.name}`,
            };
        }

        // Otherwise, continue with current match (stability)
        return { shouldSwitch: false, reason: 'Current match still live, maintaining continuity' };
    }

    // Default: switch to new best if it's more interesting
    if (newBest && getStateWeight(newBest) > getStateWeight(currentInList)) {
        return { shouldSwitch: true, reason: 'New match is more interesting' };
    }

    return { shouldSwitch: false, reason: 'Maintaining current match state' };
}

function getActiveMatch() {
    return { ...activeMatch };
}

function setActiveMatch(match, reason) {
    activeMatch = {
        matchId: match.matchId,
        selectedAt: Date.now(),
        state: match.state,
        team1: match.team1,
        team2: match.team2,
        seriesName: match.seriesName,
        priority: match.priority || calculatePriority(match),
        switchReason: reason,
    };

    console.log(`Intelligence Active match set: ${match.team1?.name} vs ${match.team2?.name} (ID: ${match.matchId}) — ${reason}`);
    return activeMatch;
}

// ────────────────────────────────────────────────────
// DATA VALIDATION LAYER
// ────────────────────────────────────────────────────

function validateCommentaryData(data) {
    const issues = [];

    if (!data) {
        return { valid: false, issues: ['No data received'] };
    }

    const hasMatchHeader = data.matchHeader && Object.keys(data.matchHeader).length > 0;
    const hasMiniscore = data.miniscore && Object.keys(data.miniscore).length > 0;
    const hasCommentary = data.matchCommentary && Object.keys(data.matchCommentary).length > 0;

    if (!hasMatchHeader) issues.push('Missing matchHeader');
    if (!hasMiniscore && !hasCommentary) issues.push('Missing both miniscore and commentary');

    // Check match state
    const state = data.matchHeader?.state || '';
    const isLive = ['In Progress', 'Toss', 'Innings Break', 'Strategic Timeout', 'Drinks', 'Stumps', 'Lunch', 'Tea'].includes(state);
    const isComplete = state === 'Complete';

    return {
        valid: issues.length === 0,
        issues,
        hasMatchHeader,
        hasMiniscore,
        hasCommentary,
        state,
        isLive,
        isComplete,
    };
}

// ────────────────────────────────────────────────────
// INTELLIGENT MATCH RESOLUTION (combines everything)
// ────────────────────────────────────────────────────
// This is the MAIN function that ties all layers together:
// Discovery → Intelligence → Continuity → Validation
// ────────────────────────────────────────────────────

async function resolveMatch(discoveredMatches) {
    // CRITICAL: Pre-calculate priorities for ALL discovered matches
    // so shouldSwitchMatch can compare priority values correctly.
    // Without this, m.priority is undefined and comparisons break.
    const prioritizedMatches = discoveredMatches.map(m => ({
        ...m,
        priority: m.priority || calculatePriority(m),
    }));

    // Step 1: Select best match from prioritized matches
    const selection = selectBestMatch(prioritizedMatches);

    if (!selection.match) {
        return {
            success: false,
            error: 'No matches available',
            details: selection,
        };
    }

    // Step 2: Check continuity — should we switch?
    const current = getActiveMatch();
    const continuity = shouldSwitchMatch(current, selection.match, prioritizedMatches);

    let finalMatchId;
    let switchInfo;

    if (continuity.shouldSwitch) {
        // Switch to new match
        setActiveMatch(selection.match, continuity.reason);
        finalMatchId = selection.match.matchId;
        switchInfo = {
            switched: true,
            reason: continuity.reason,
            from: current.matchId || 'none',
            to: selection.match.matchId,
        };
    } else {
        // Continue with current match
        finalMatchId = current.matchId;
        switchInfo = {
            switched: false,
            reason: continuity.reason,
            currentMatchId: current.matchId,
        };
    }

    return {
        success: true,
        matchId: finalMatchId,
        selection,
        continuity: switchInfo,
        activeMatch: getActiveMatch(),
    };
}

// Reset active match (for testing)
function resetActiveMatch() {
    activeMatch = {
        matchId: null,
        selectedAt: 0,
        state: null,
        team1: null,
        team2: null,
        seriesName: null,
        priority: Infinity,
        switchReason: null,
    };
    console.log('Intelligence Active match reset');
}

module.exports = {
    calculatePriority,
    selectBestMatch,
    shouldSwitchMatch,
    getActiveMatch,
    setActiveMatch,
    resetActiveMatch,
    validateCommentaryData,
    resolveMatch,
};
