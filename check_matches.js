const axios = require('axios');
axios.get('http://localhost:9000/api/cricbuzz/live/discover')
    .then(res => {
        console.log(JSON.stringify(res.data.matches.map(m => ({
            id: m.matchId,
            teams: `${m.team1.name} vs ${m.team2.name}`,
            series: m.seriesName,
            isLive: m.isLive
        })), null, 2));
    })
    .catch(err => console.error(err.message));
