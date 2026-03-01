const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3851;

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3850',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Proxy for GitHub API
app.use('/api/github', createProxyMiddleware({
  target: 'https://api.github.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/github': '',
  },
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('User-Agent', 'SARTRAC-Proxy');
  }
}));

// Proxy for GitHub releases (raw files)
app.use('/api/releases', createProxyMiddleware({
  target: 'https://github.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/releases': '',
  },
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('User-Agent', 'SARTRAC-Proxy');
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CORS proxy server running' });
});

app.listen(PORT, () => {
  console.log(`🚀 CORS Proxy Server running on http://localhost:${PORT}`);
  console.log(`   - GitHub API: http://localhost:${PORT}/api/github`);
  console.log(`   - GitHub Releases: http://localhost:${PORT}/api/releases`);
});