# SARTRAC Production Monitoring & Alerting

This document outlines monitoring strategies and alerting configurations for the satellite-enhanced SARTRAC application.

## 🔍 Monitoring Overview

### Key Metrics to Monitor

#### Application Health
- **Uptime**: Application availability (target: 99.9%)
- **Response Time**: Page load performance (target: <2s)
- **Error Rate**: HTTP 4xx/5xx responses (target: <1%)
- **Resource Usage**: CPU, Memory, Disk utilization

#### Satellite Data Health
- **ERDDAP Server Status**: VIIRS and OLCI data availability
- **Data Freshness**: Latest satellite observation timestamps
- **API Response Times**: Satellite service latency
- **Fallback Activation**: When backup systems engage

#### User Experience
- **Forecast Accuracy**: Satellite vs model-only comparisons
- **Feature Usage**: Enhanced vs standard forecast mode adoption
- **Geographic Coverage**: Regional data availability
- **User Engagement**: Session duration and interaction patterns

## 📊 Monitoring Implementation

### 1. Health Check Endpoints

#### Application Health Check
```javascript
// Available at: /health
{
  "status": "healthy",
  "service": "sartrac-frontend",
  "version": "2.0.0",
  "timestamp": "2025-10-14T12:00:00Z",
  "checks": {
    "satellite_service": "operational",
    "forecast_service": "operational",
    "erddap_viirs": "online",
    "erddap_olci": "degraded"
  }
}
```

#### Satellite Data Status Check
```javascript
// Available at: /api/satellite/status
{
  "status": "partial",
  "sources": {
    "viirs": {
      "status": "online",
      "last_update": "2025-10-14T11:45:00Z",
      "latency_ms": 1250,
      "error_rate": 0.02
    },
    "olci": {
      "status": "degraded",
      "last_update": "2025-10-14T09:30:00Z",
      "latency_ms": 8500,
      "error_rate": 0.15
    }
  },
  "fallback_active": true
}
```

### 2. Application Monitoring

#### Docker Health Checks
```dockerfile
# Already included in Dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

#### Nginx Monitoring
```nginx
# In nginx configuration
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

### 3. External Monitoring Services

#### Uptime Monitoring
Configure external services to monitor:
- **Primary URL**: `https://your-domain.com/health`
- **Satellite API**: `https://your-domain.com/api/satellite/status`
- **Check Frequency**: Every 5 minutes
- **Timeout**: 30 seconds

Recommended services:
- UptimeRobot (free tier available)
- Pingdom
- StatusCake
- AWS CloudWatch Synthetics

#### Performance Monitoring
```javascript
// Web Vitals monitoring
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

## 🚨 Alerting Configuration

### 1. Critical Alerts (Immediate Response)

#### Application Down
- **Condition**: Health check fails for >2 minutes
- **Notification**: SMS + Email + Slack
- **Escalation**: If not acknowledged in 15 minutes

#### Satellite Data Complete Failure
- **Condition**: All ERDDAP sources down for >10 minutes
- **Notification**: Email + Slack
- **Action**: Activate emergency fallback mode

#### High Error Rate
- **Condition**: >5% error rate for >5 minutes
- **Notification**: Email + Slack
- **Action**: Check logs and investigate

### 2. Warning Alerts (Monitoring Required)

#### Performance Degradation
- **Condition**: Response time >5 seconds for >10 minutes
- **Notification**: Email
- **Action**: Performance investigation

#### Partial Satellite Data Loss
- **Condition**: One ERDDAP source down for >30 minutes
- **Notification**: Email
- **Action**: Monitor user impact

#### Resource Usage High
- **Condition**: CPU >80% or Memory >90% for >15 minutes
- **Notification**: Email
- **Action**: Resource scaling consideration

### 3. Informational Alerts

#### Deployment Notifications
- **Trigger**: Successful production deployment
- **Notification**: Slack channel
- **Content**: Version, changelog, rollback instructions

#### Weekly Health Reports
- **Schedule**: Every Monday 9 AM
- **Content**: Uptime, performance metrics, user statistics
- **Distribution**: Operations team email

## 📈 Monitoring Tools Setup

### 1. Prometheus + Grafana (Self-hosted)

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'sartrac-frontend'
    static_configs:
      - targets: ['sartrac-frontend:8080']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'nginx-exporter'
    static_configs:
      - targets: ['nginx-exporter:9113']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "SARTRAC Application Monitoring",
    "panels": [
      {
        "title": "Application Uptime",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"sartrac-frontend\"}",
            "legendFormat": "Frontend Status"
          }
        ]
      },
      {
        "title": "Satellite Data Availability",
        "type": "graph",
        "targets": [
          {
            "expr": "satellite_data_availability",
            "legendFormat": "{{source}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "http_request_duration_seconds",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      }
    ]
  }
}
```

### 2. Cloud-based Monitoring

#### AWS CloudWatch
```yaml
# cloudwatch-config.json
{
  "agent": {
    "metrics_collection_interval": 60
  },
  "metrics": {
    "namespace": "SARTRAC/Application",
    "metrics_collected": {
      "cpu": {
        "measurement": ["cpu_usage_idle", "cpu_usage_iowait"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["used_percent"],
        "metrics_collection_interval": 60,
        "resources": ["*"]
      },
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 60
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "sartrac-nginx-access",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

#### Google Cloud Monitoring
```yaml
# monitoring.yaml
resources:
  - name: sartrac-uptime-check
    type: compute.v1.urlMap
    properties:
      defaultService: $(ref.sartrac-backend-service.selfLink)
      hostRules:
        - hosts: ["your-domain.com"]
          pathMatcher: "path-matcher-1"
      pathMatchers:
        - name: "path-matcher-1"
          defaultService: $(ref.sartrac-backend-service.selfLink)
```

## 📊 Custom Metrics Collection

### 1. Application Metrics
```javascript
// metrics.js - Custom metrics collection
class MetricsCollector {
  constructor() {
    this.metrics = {
      satelliteDataRequests: 0,
      forecastAccuracy: [],
      userSessions: 0,
      errorCount: 0
    };
  }

  incrementSatelliteRequests(source) {
    this.metrics.satelliteDataRequests++;
    console.log(`Satellite request: ${source}`);
  }

  recordForecastAccuracy(accuracy) {
    this.metrics.forecastAccuracy.push({
      timestamp: new Date(),
      accuracy: accuracy
    });
  }

  recordError(error) {
    this.metrics.errorCount++;
    console.error('Application error:', error);
  }

  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date()
    };
  }
}

export const metrics = new MetricsCollector();
```

### 2. Satellite Service Metrics
```javascript
// In satelliteService.ts
private recordMetrics(operation: string, duration: number, success: boolean) {
  const metric = {
    operation,
    duration,
    success,
    timestamp: new Date(),
    source: 'satellite-service'
  };
  
  // Send to monitoring system
  if (window.gtag) {
    window.gtag('event', 'satellite_operation', {
      event_category: 'performance',
      event_label: operation,
      value: duration,
      custom_parameter_success: success
    });
  }
}
```

## 🔧 Alerting Tools Configuration

### 1. Slack Integration
```javascript
// slack-alerts.js
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

async function sendSlackAlert(severity, message, details) {
  const color = {
    'critical': '#FF0000',
    'warning': '#FFA500',
    'info': '#00FF00'
  }[severity];

  const payload = {
    attachments: [{
      color: color,
      title: `SARTRAC Alert - ${severity.toUpperCase()}`,
      text: message,
      fields: [
        {
          title: "Details",
          value: details,
          short: false
        },
        {
          title: "Timestamp",
          value: new Date().toISOString(),
          short: true
        }
      ]
    }]
  };

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
```

### 2. Email Alerts
```javascript
// email-alerts.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL,
    pass: process.env.ALERT_EMAIL_PASSWORD
  }
});

async function sendEmailAlert(severity, subject, body) {
  const mailOptions = {
    from: process.env.ALERT_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: `[SARTRAC ${severity.toUpperCase()}] ${subject}`,
    html: `
      <h2>SARTRAC System Alert</h2>
      <p><strong>Severity:</strong> ${severity}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <hr>
      <p>${body}</p>
      <hr>
      <p><em>This is an automated alert from the SARTRAC monitoring system.</em></p>
    `
  };

  await transporter.sendMail(mailOptions);
}
```

## 📋 Monitoring Checklist

### Daily Checks
- [ ] Application uptime status
- [ ] Satellite data source availability
- [ ] Error rate and performance metrics
- [ ] Resource utilization levels
- [ ] User activity patterns

### Weekly Reviews
- [ ] Performance trend analysis
- [ ] Satellite data quality assessment
- [ ] User feedback and issues
- [ ] Security alerts and patches
- [ ] Capacity planning review

### Monthly Assessments
- [ ] Full system health audit
- [ ] Monitoring tool effectiveness review
- [ ] Alert threshold optimization
- [ ] Documentation updates
- [ ] Disaster recovery testing

---

This comprehensive monitoring setup ensures reliable operation of the satellite-enhanced SARTRAC application with proactive issue detection and rapid response capabilities.