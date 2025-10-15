/**
 * Simple CORS proxy service for accessing GitHub release files
 */

export class CorsProxyService {
  private static readonly PROXY_URLS = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/',
  ];

  /**
   * Fetch a URL with CORS proxy fallback
   */
  static async fetchWithProxy(url: string): Promise<Response> {
    // Try direct fetch first
    try {
      const response = await fetch(url, {
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('Direct fetch successful');
        return response;
      }
    } catch (error) {
      console.warn('Direct fetch failed, trying proxies:', error);
    }

    // Try proxy services
    let lastError: Error | null = null;
    
    for (const proxyUrl of this.PROXY_URLS) {
      try {
        console.log(`Trying proxy: ${proxyUrl}`);
        
        const proxiedUrl = `${proxyUrl}${encodeURIComponent(url)}`;
        const response = await fetch(proxiedUrl, {
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (response.ok) {
          console.log(`Proxy fetch successful: ${proxyUrl}`);
          return response;
        } else {
          throw new Error(`Proxy returned ${response.status}: ${response.statusText}`);
        }
        
      } catch (error) {
        console.warn(`Proxy ${proxyUrl} failed:`, error);
        lastError = error instanceof Error ? error : new Error('Unknown proxy error');
      }
    }

    // If all proxies fail, throw the last error
    throw lastError || new Error('All proxy methods failed');
  }

  /**
   * Check if a URL is likely to have CORS issues
   */
  static needsProxy(url: string): boolean {
    // GitHub release downloads typically need proxy for browser CORS
    return url.includes('github.com') && url.includes('/releases/download/');
  }
}