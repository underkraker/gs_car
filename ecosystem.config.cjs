module.exports = {
  apps: [
    {
      name: 'gscling',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
