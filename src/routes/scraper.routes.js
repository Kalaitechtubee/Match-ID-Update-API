const express = require('express');
const router = express.Router();
const scraperController = require('../controllers/scraper.controller');

router.get('/matches/all', scraperController.getAllMatches);
router.get('/matches/live', scraperController.getLiveMatches);
router.get('/matches/upcoming', scraperController.getUpcomingMatches);
router.get('/matches/recent', scraperController.getRecentMatches);
router.get('/scrape/match/:matchId', scraperController.getMatchDetails);
router.get('/series', scraperController.getAllSeries);

module.exports = router;
