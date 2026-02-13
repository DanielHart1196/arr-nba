import { error, json } from '@sveltejs/kit';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Referer': 'https://www.reddit.com/',
};

export const GET = async ({ url }) => {
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  // Basic security check: only allow reddit urls
  if (!targetUrl.includes('reddit.com')) {
    throw error(403, 'Only reddit.com URLs are allowed');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: BROWSER_HEADERS
    });

    if (!response.ok) {
      console.error(`Vercel Bridge Proxy Error: ${response.status} for ${targetUrl}`);
      return new Response(await response.text(), { 
        status: response.status,
        headers: { 'content-type': 'text/plain' }
      });
    }

    const data = await response.json();
    return json(data);
  } catch (err) {
    console.error('Vercel Bridge Proxy Exception:', err);
    throw error(500, 'Bridge failed to fetch');
  }
};
