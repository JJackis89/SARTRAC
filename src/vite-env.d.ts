/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_NODE_ENV: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_FORECAST_API_URL: string
  readonly VITE_ERDDAP_VIIRS_URL: string
  readonly VITE_ERDDAP_OLCI_URL: string
  readonly VITE_ERDDAP_BACKUP_URL: string
  readonly VITE_ERDDAP_API_KEY: string
  readonly VITE_GEE_SERVICE_URL: string
  readonly VITE_GEE_API_KEY: string
  readonly VITE_ENABLE_REAL_SATELLITE_DATA: string
  readonly VITE_SATELLITE_CACHE_DURATION: string
  readonly VITE_SATELLITE_TIMEOUT: string
  readonly VITE_SATELLITE_RETRY_ATTEMPTS: string
  readonly VITE_FORECAST_CACHE_DURATION: string
  readonly VITE_FORECAST_UPDATE_INTERVAL: string
  readonly VITE_MAX_FORECAST_DAYS: string
  readonly VITE_DEFAULT_MAP_CENTER_LAT: string
  readonly VITE_DEFAULT_MAP_CENTER_LNG: string
  readonly VITE_DEFAULT_ZOOM_LEVEL: string
  readonly VITE_MAX_ZOOM_LEVEL: string
  readonly VITE_ENABLE_SERVICE_WORKER: string
  readonly VITE_ENABLE_PWA: string
  readonly VITE_CHUNK_SIZE_WARNING_LIMIT: string
  readonly VITE_ANALYTICS_ID: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_ENABLE_SATELLITE_INTEGRATION: string
  readonly VITE_ENABLE_BEACHED_DETECTION: string
  readonly VITE_ENABLE_COASTSNAP_INTEGRATION: string
  readonly VITE_ENABLE_DEBUG_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}