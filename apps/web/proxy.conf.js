require('dotenv').config();

const apiPort = process.env.API_PORT || '3333';

module.exports = {
  '/v1': {
    target: `http://localhost:${apiPort}`,
    secure: false,
  },
  '/api': {
    target: `http://localhost:${apiPort}`,
    secure: false,
  },
};
