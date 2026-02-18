require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
  console.log(`🏏 Cricket Unified Server Started on port ${PORT}`);
  console.log(`🚀 API documentation available at http://localhost:${PORT}/`);
});