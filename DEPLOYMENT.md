# SARTRAC Production Deployment Guide

This guide covers deploying the satellite-enhanced SARTRAC application to production environments.

## 🚀 Quick Deployment Options

### Option 1: Docker Compose (Recommended)
```bash
# Clone the repository
git clone https://github.com/JJackis89/SARTRAC.git
cd SARTRAC

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your production values

# Deploy with Docker Compose
docker-compose up -d

# Access application at http://localhost
```

### Option 2: Manual Build & Deploy
```bash
# Build the application
npm install
npm run build

# Deploy dist/ folder to your web server
# Configure nginx/apache to serve the files
```

### Option 3: GitHub Actions Auto-Deploy
Push to `main` branch to trigger automatic deployment via GitHub Actions.

## 📋 Prerequisites

### System Requirements
- **Docker & Docker Compose** (recommended)
- **Node.js 18+** (for manual builds)
- **Nginx/Apache** (for manual deployments)
- **SSL Certificate** (for HTTPS)

### Required Environment Variables
Create a `.env` file with the following variables:

```bash
# Application
VITE_APP_NAME=SARTRAC
VITE_NODE_ENV=production

# Satellite Data Sources
VITE_ERDDAP_VIIRS_URL=https://coastwatch.pfeg.noaa.gov/erddap
VITE_ERDDAP_OLCI_URL=https://oceandata.sci.gsfc.nasa.gov/erddap
VITE_ERDDAP_BACKUP_URL=https://upwell.pfeg.noaa.gov/erddap

# API Configuration
VITE_FORECAST_API_URL=https://github.com/JJackis89/SARTRAC/releases/latest/download

# Optional: Google Earth Engine
VITE_GEE_SERVICE_URL=https://your-gee-service.com/api
VITE_GEE_API_KEY=your_api_key_here
```

See `.env.example` for complete configuration options.

## 🔧 Deployment Steps

### 1. Environment Setup

#### Production Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit with your production values
nano .env
```

#### Required Configurations
- **ERDDAP URLs**: Configure satellite data sources
- **API Keys**: Add Google Earth Engine credentials (if using)
- **Domain Settings**: Set your production domain
- **Analytics**: Configure monitoring (optional)

### 2. Docker Deployment

#### Build and Run
```bash
# Build the Docker image
docker build -t sartrac:latest .

# Run with Docker Compose
docker-compose up -d

# Check deployment status
docker-compose ps
docker-compose logs sartrac-frontend
```

#### Health Checks
```bash
# Check application health
curl http://localhost/health

# Expected response:
# {"status": "healthy", "service": "sartrac-frontend"}
```

### 3. Manual Deployment

#### Build Process
```bash
# Install dependencies
npm ci --only=production

# Build for production
npm run build

# Output will be in dist/ directory
```

#### Web Server Configuration

**Nginx Configuration** (`/etc/nginx/sites-available/sartrac`):
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/sartrac/dist;
    index index.html;

    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**Apache Configuration** (`.htaccess`):
```apache
RewriteEngine On
RewriteBase /

# Handle client-side routing
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Security headers
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"

# Cache static assets
<FilesMatch "\.(js|css|png|jpg|jpeg|gif|ico|svg)$">
    ExpiresActive On
    ExpiresDefault "access plus 1 year"
    Header set Cache-Control "public, immutable"
</FilesMatch>
```

### 4. SSL Certificate Setup

#### Using Let's Encrypt (Certbot)
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

#### Using Docker with Traefik
See `docker-compose.yml` for Traefik configuration with automatic SSL.

## 🔍 Monitoring & Maintenance

### Health Monitoring

#### Application Health Check
```bash
# Health endpoint
curl https://your-domain.com/health

# Response should be:
# {"status": "healthy", "service": "sartrac-frontend"}
```

#### Satellite Data Status
Monitor satellite data availability through the application UI:
- VIIRS data status indicator
- OLCI data status indicator
- Fallback data activation alerts

### Log Monitoring

#### Docker Logs
```bash
# View application logs
docker-compose logs -f sartrac-frontend

# View nginx logs
docker-compose exec sartrac-frontend tail -f /var/log/nginx/access.log
```

#### System Logs
```bash
# Nginx logs (manual deployment)
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Application performance
htop
df -h
```

### Performance Monitoring

#### Key Metrics to Monitor
- **Response Time**: Page load performance
- **Satellite Data Latency**: ERDDAP server response times
- **Error Rates**: Failed API requests
- **User Activity**: Forecast usage patterns

#### Monitoring Tools
- **Built-in Health Checks**: `/health` endpoint
- **Browser DevTools**: Performance monitoring
- **External Monitoring**: Uptime Robot, Pingdom
- **Log Analysis**: ELK stack, Grafana

## 🚨 Troubleshooting

### Common Issues

#### 1. Satellite Data Not Loading
```bash
# Check ERDDAP server status
curl -I https://coastwatch.pfeg.noaa.gov/erddap/info/index.html

# Check environment variables
echo $VITE_ERDDAP_VIIRS_URL
echo $VITE_ERDDAP_OLCI_URL

# Verify fallback system
grep "Fallback" /var/log/nginx/access.log
```

#### 2. Build Failures
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear cache and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### 3. Docker Issues
```bash
# Check container status
docker-compose ps

# View container logs
docker-compose logs sartrac-frontend

# Restart services
docker-compose restart

# Rebuild containers
docker-compose build --no-cache
docker-compose up -d
```

#### 4. SSL Certificate Issues
```bash
# Check certificate status
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Renew Let's Encrypt certificate
sudo certbot renew --dry-run
```

### Performance Optimization

#### Frontend Optimization
- **Code Splitting**: Implemented in Vite build
- **Asset Caching**: 1-year cache for static assets
- **Gzip Compression**: Enabled in nginx configuration
- **CDN Integration**: Consider CloudFlare for global distribution

#### Backend Optimization
- **Satellite Data Caching**: Implemented in service layer
- **API Rate Limiting**: Configure in nginx
- **Database Optimization**: Index forecast data queries
- **Load Balancing**: Scale horizontally for high traffic

## 🔄 Updates & Maintenance

### Automatic Updates
- **Dependencies**: Weekly automated PRs via GitHub Actions
- **Security Patches**: Trivy scanning in CI/CD pipeline
- **Docker Images**: Auto-rebuild on base image updates

### Manual Updates
```bash
# Update to latest version
git pull origin main
docker-compose build --no-cache
docker-compose up -d

# Verify deployment
curl https://your-domain.com/health
```

### Backup Strategy
- **Configuration Files**: Version controlled in Git
- **Environment Variables**: Securely stored and backed up
- **Container Volumes**: Regular snapshots if using persistent data

## 📞 Support

### Documentation
- **Technical Documentation**: `SATELLITE_INTEGRATION.md`
- **User Guide**: Available in application help section
- **API Documentation**: Generated from OpenAPI specs

### Contact
- **GitHub Issues**: Report bugs and feature requests
- **Email**: Contact repository maintainers
- **Documentation**: This deployment guide

---

## 📝 Deployment Checklist

Before going live, ensure:

- [ ] Environment variables configured
- [ ] SSL certificate installed
- [ ] Health checks passing
- [ ] Satellite data sources accessible
- [ ] Monitoring systems active
- [ ] Backup procedures tested
- [ ] Performance benchmarks established
- [ ] Security headers configured
- [ ] CDN configured (if applicable)
- [ ] DNS records updated

**Happy Deploying! 🚀**