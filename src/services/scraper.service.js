// Puppeteer is optional — not available on some serverless platforms
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.log('⚠️ [Scraper] Puppeteer not available — scraper fallback disabled (API-only mode)');
    puppeteer = null;
}

// Helper functions
function extractMatchId(url) {
    const match = url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
}

function cleanText(text) {
    return text ? text.trim().replace(/\s+/g, ' ').replace(/\n+/g, ' ') : '';
}

function parseTeamNamesFromUrl(url) {
    const urlMatch = url.match(/\/([a-z]+)-vs-([a-z]+)-/i);
    if (urlMatch) {
        return `${urlMatch[1].toUpperCase()} vs ${urlMatch[2].toUpperCase()}`;
    }
    return null;
}

// Scrape matches from a specific URL
async function scrapeMatchesFromUrl(url, matchType) {
    if (!puppeteer) {
        console.log('⚠️ [Scraper] Puppeteer not available, skipping scrape');
        return [];
    }
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Scraping ${matchType} matches from: ${url}`);

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
        });

        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        const matches = await page.evaluate((type) => {
            const results = [];

            // Find all match-related elements
            const matchElements = Array.from(document.querySelectorAll('div, a, article'));

            // Look for links containing live-cricket-scores
            const matchLinks = [];
            matchElements.forEach(element => {
                const links = element.querySelectorAll ?
                    Array.from(element.querySelectorAll('a[href*="live-cricket-scores"]')) : [];

                if (element.href && element.href.includes('live-cricket-scores')) {
                    links.push(element);
                }

                matchLinks.push(...links);
            });

            // Remove duplicates
            const uniqueLinks = matchLinks.filter((link, index, self) =>
                index === self.findIndex(l => l.href === link.href)
            );

            uniqueLinks.forEach(link => {
                try {
                    const href = link.href;
                    const matchId = href.match(/\/(\d+)\//)?.[1];

                    if (!matchId) return;

                    // Get container with match information
                    let container = link;
                    for (let i = 0; i < 4; i++) {
                        if (container.parentElement && container.parentElement.innerText.length > container.innerText.length) {
                            container = container.parentElement;
                        } else {
                            break;
                        }
                    }

                    const containerText = container.innerText || '';
                    const linkText = link.innerText || '';
                    const allText = containerText + ' ' + linkText;

                    // Extract team names from URL (most reliable)
                    let teams = '';
                    const urlTeamMatch = href.match(/\/([a-z]+)-vs-([a-z]+)-/i);
                    if (urlTeamMatch) {
                        const team1 = urlTeamMatch[1].toUpperCase();
                        const team2 = urlTeamMatch[2].toUpperCase();
                        teams = `${team1} vs ${team2}`;
                    } else {
                        // Fallback to text extraction
                        const textTeamMatch = allText.match(/([A-Z]{2,4})\s*vs\s*([A-Z]{2,4})/i);
                        if (textTeamMatch) {
                            teams = `${textTeamMatch[1]} vs ${textTeamMatch[2]}`;
                        }
                    }

                    // Extract series/tournament name
                    let series = 'Unknown Tournament';
                    const urlParts = href.split('/');
                    const lastPart = urlParts[urlParts.length - 1];

                    // Look for tournament patterns in URL
                    const tournamentPatterns = [
                        /([a-z-]*(?:cup|league|trophy|tour|series|premier|championship|t20i|odi|test)[a-z-]*)/i,
                        /([a-z-]*(?:ipl|bbl|psl|cpl|hundred)[a-z-]*)/i
                    ];

                    for (const pattern of tournamentPatterns) {
                        const match = lastPart.match(pattern);
                        if (match) {
                            series = match[1].replace(/-/g, ' ')
                                .split(' ')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ');
                            break;
                        }
                    }

                    // Extract scores
                    const scores = [];
                    const scorePatterns = [
                        /(\d+[-\/]\d*)\s*\([\d.]+\s*[Oo]vs?\)/g,
                        /(\d+[-\/]\d*)\s*\([\d.]+\)/g,
                        /([A-Z]{2,4})\s*(\d+[-\/]\d*)\s*\([\d.]+/g
                    ];

                    scorePatterns.forEach(pattern => {
                        let match;
                        while ((match = pattern.exec(allText)) !== null) {
                            if (match[2]) { // Pattern with team name
                                scores.push(`${match[1]} ${match[2]}${match[0].match(/\([^)]+\)/)?.[0] || ''}`);
                            } else { // Pattern without team name
                                scores.push(match[0]);
                            }
                        }
                    });

                    // Determine match status
                    let status = type;
                    if (allText.includes('won by') || allText.includes('beat')) {
                        const winMatch = allText.match(/([^.\n]*(?:won by|beat)[^.\n]*)/i);
                        if (winMatch) {
                            status = winMatch[1].trim();
                        }
                    } else if (type === 'live' || scores.length > 0) {
                        status = 'Live';
                    } else if (type === 'upcoming') {
                        status = 'Upcoming';
                    } else if (type === 'recent') {
                        status = 'Completed';
                    }

                    // Extract venue
                    let venue = '';
                    const venueMatch = allText.match(/at\s+([^,\n]+)/i);
                    if (venueMatch) {
                        venue = venueMatch[1].trim().substring(0, 50);
                    }

                    // Extract date/time information
                    let dateTime = '';
                    const datePatterns = [
                        /Today/i,
                        /Tomorrow/i,
                        /\d{1,2}\s+[A-Za-z]{3}/,
                        /\d{1,2}\/\d{1,2}\/\d{4}/
                    ];

                    const timePattern = /\d{1,2}:\d{2}\s*[AP]M/i;

                    datePatterns.forEach(pattern => {
                        const match = allText.match(pattern);
                        if (match) {
                            dateTime += match[0] + ' ';
                        }
                    });

                    const timeMatch = allText.match(timePattern);
                    if (timeMatch) {
                        dateTime += timeMatch[0];
                    }

                    // Only add if we have essential data
                    if (matchId && teams) {
                        results.push({
                            match_id: matchId,
                            match_url: href,
                            teams: teams,
                            series: series,
                            status: status,
                            venue: venue,
                            date_time: dateTime.trim(),
                            scores: [...new Set(scores)], // Remove duplicates
                            match_type: type,
                            scraped_at: new Date().toISOString()
                        });
                    }

                } catch (err) {
                    console.log(`Error processing match: ${err.message}`);
                }
            });

            return results;
        }, matchType);

        console.log(`Found ${matches.length} ${matchType} matches`);
        return matches;

    } finally {
        await browser.close();
    }
}

async function scrapeSeries() {
    if (!puppeteer) {
        console.log('⚠️ [Scraper] Puppeteer not available, skipping scrape');
        return [];
    }
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto('https://www.cricbuzz.com/cricket-schedule/upcoming-series/international', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const series = await page.evaluate(() => {
            const results = [];
            const seriesElements = Array.from(document.querySelectorAll('div, a, article'));

            seriesElements.forEach(element => {
                const links = element.querySelectorAll ?
                    Array.from(element.querySelectorAll('a[href*="cricket-series"]')) : [];

                if (element.href && element.href.includes('cricket-series')) {
                    links.push(element);
                }

                links.forEach(link => {
                    const href = link.href || '';
                    const text = link.innerText || '';

                    if (href.includes('cricket-series') && text.length > 5 && text.length < 100) {
                        const seriesId = href.match(/cricket-series\/(\d+)/)?.[1];

                        if (seriesId && !text.includes('SCHEDULE') && !text.includes('undefined')) {
                            let parentText = '';
                            let parent = link.parentElement;
                            for (let i = 0; i < 3 && parent; i++) {
                                if (parent.innerText && parent.innerText.length > text.length) {
                                    parentText = parent.innerText;
                                    break;
                                }
                                parent = parent.parentElement;
                            }

                            let dateInfo = '';
                            const dateMatch = parentText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
                            if (dateMatch) {
                                dateInfo = dateMatch[0];
                            }

                            results.push({
                                series_id: seriesId,
                                series_name: text.trim(),
                                series_url: href,
                                date_info: dateInfo,
                                scraped_at: new Date().toISOString()
                            });
                        }
                    }
                });
            });

            const unique = results.filter((series, index, self) =>
                index === self.findIndex(s => s.series_id === series.series_id)
            );

            return unique;
        });

        return series;
    } finally {
        await browser.close();
    }
}

async function scrapeT20WorldCupSchedule() {
    if (!puppeteer) {
        console.log('⚠️ [Scraper] Puppeteer not available, skipping scrape');
        return [];
    }
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Scraping T20 World Cup schedule...');
        await page.goto('https://www.cricbuzz.com/cricket-schedule/upcoming-series/international', {
            waitUntil: 'domcontentloaded',
            timeout: 20000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const matches = await page.evaluate(() => {
            const results = [];
            const sections = Array.from(document.querySelectorAll('.cb-col-100.cb-col'));

            sections.forEach(section => {
                const text = section.innerText || '';
                if (text.includes("ICC Men's T20 World Cup 2026")) {
                    const links = Array.from(section.querySelectorAll('a[href*="/cricket-match-facts/"]'));
                    links.forEach(link => {
                        const href = link.href;
                        const matchId = href.match(/\/(\d+)\//)?.[1];
                        const matchText = link.innerText;

                        if (matchId && matchText) {
                            results.push({
                                matchId,
                                teams: matchText.split(',')[0].trim(),
                                description: matchText.split(',')[1]?.trim() || '',
                                url: href
                            });
                        }
                    });
                }
            });
            return results;
        });

        return matches;
    } finally {
        await browser.close();
    }
}

async function scrapeMatchDetails(matchId) {
    if (!puppeteer) {
        return { error: 'Scraper not available in this environment', match_id: matchId };
    }
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const matchUrl = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;

        await page.goto(matchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        const matchDetails = await page.evaluate(() => {
            const pageText = document.body.innerText || '';
            const title = document.title || '';

            const teams = [];
            const teamMatch = title.match(/([A-Za-z\s]+)\s+vs\s+([A-Za-z\s]+)/i);
            if (teamMatch) {
                teams.push({
                    team1: teamMatch[1].trim(),
                    team2: teamMatch[2].trim()
                });
            }

            let matchInfo = '';
            const matchInfoMatch = title.match(/(T20I|ODI|Test|Final|Semi-Final|\d+(?:st|nd|rd|th)\s+\w+)/i);
            if (matchInfoMatch) {
                matchInfo = matchInfoMatch[1];
            }

            const scoreData = [];
            const currentScorePattern = /([A-Z]{2,4})\s*(\d+[-\/]\d*)\s*\([\d.]+\s*[Oo]vs?\)/g;
            let scoreMatch;
            while ((scoreMatch = currentScorePattern.exec(pageText)) !== null) {
                scoreData.push({
                    team: scoreMatch[1],
                    score: scoreMatch[2],
                    overs: scoreMatch[0].match(/\([\d.]+\s*[Oo]vs?\)/)?.[0] || '',
                    full_score: scoreMatch[0]
                });
            }

            let matchStatus = 'In Progress';
            let target = '';
            let result = '';

            if (pageText.includes('won by')) {
                const winMatch = pageText.match(/([A-Za-z\s]+)\s+won by\s+([^.\n]*)/i);
                if (winMatch) {
                    matchStatus = `${winMatch[1].trim()} won by ${winMatch[2].trim()}`;
                    result = matchStatus;
                }
            } else if (pageText.includes('need') && pageText.includes('runs')) {
                const needMatch = pageText.match(/([A-Za-z\s]+)\s+need\s+(\d+)\s+runs/i);
                if (needMatch) {
                    target = `${needMatch[1].trim()} need ${needMatch[2]} runs`;
                    matchStatus = 'Live - Chasing';
                }
            } else if (pageText.includes('Innings Break')) {
                matchStatus = 'Innings Break';
            } else if (scoreData.length > 0) {
                matchStatus = 'Live';
            }

            let venue = '';
            let city = '';
            const venuePattern = /at\s+([^,\n]+),?\s*([^,\n]+)/i;
            const venueMatch = pageText.match(venuePattern);
            if (venueMatch) {
                city = venueMatch[1].trim();
                venue = venueMatch[2] ? venueMatch[2].trim() : '';
            }

            let toss = '';
            const tossPatterns = [
                /([A-Za-z\s]+)\s+opt to\s+(bat|bowl)/i,
                /([A-Za-z\s]+)\s+elected to\s+(bat|bowl)/i,
                /([A-Za-z\s]+)\s+chose to\s+(bat|bowl)/i,
                /Toss:\s*([A-Za-z\s]+)\s*-\s*(bat|bowl)/i
            ];

            for (const pattern of tossPatterns) {
                const tossMatch = pageText.match(pattern);
                if (tossMatch) {
                    toss = `${tossMatch[1].trim()} opt to ${tossMatch[2]}`;
                    break;
                }
            }

            let currentOver = '';
            const overPatterns = [
                /(\d+\.\d+)\s*[Oo]vs?/,
                /Over\s*(\d+\.\d+)/i,
                /(\d+)\s*overs?\s*(\d+)\s*balls?/i
            ];

            for (const pattern of overPatterns) {
                const overMatch = pageText.match(pattern);
                if (overMatch) {
                    currentOver = overMatch[1] + ' Overs';
                    break;
                }
            }

            let series = '';
            const seriesMatch = title.match(/([\w\s]+(Cup|League|Trophy|Tour|Series|Championship|T20|ODI|Test)[\w\s]*)/i);
            if (seriesMatch) {
                series = seriesMatch[1].trim();
            }

            let matchDate = '';
            const dateMatch = pageText.match(/(Today|Tomorrow|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
            if (dateMatch) {
                matchDate = dateMatch[1];
            }

            return {
                match_id: window.location.pathname.match(/\/(\d+)(?:\/|$)/)?.[1] || '',
                title: title,
                teams: teams,
                match_info: matchInfo,
                score_data: scoreData,
                status: matchStatus,
                result: result,
                target: target,
                venue: venue,
                city: city,
                toss: toss,
                current_over: currentOver,
                series: series,
                match_date: matchDate,
                last_updated: new Date().toISOString(),
                scraped_at: new Date().toISOString()
            };
        });

        return matchDetails;
    } finally {
        await browser.close();
    }
}

module.exports = {
    scrapeMatchesFromUrl,
    scrapeSeries,
    scrapeT20WorldCupSchedule,
    scrapeMatchDetails
};
