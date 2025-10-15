// Quick fix for CORS issues - simple fallback approach
// This can be integrated into the main forecastService.ts

export const fetchWithCorsProxy = async (url: string): Promise<Response> => {
  // Try direct fetch first
  try {
    console.log('Attempting direct fetch...');
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (response.ok) {
      console.log('✅ Direct fetch successful');
      return response;
    }
  } catch (error) {
    console.warn('❌ Direct fetch failed:', error);
  }

  // CORS Proxy fallbacks
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      console.log('🔄 Trying proxy:', proxyUrl.split('?')[0]);
      const response = await fetch(proxyUrl, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        console.log('✅ Proxy fetch successful');
        return response;
      }
    } catch (error) {
      console.warn('❌ Proxy failed:', error);
    }
  }

  throw new Error('All fetch methods failed - CORS issue');
};