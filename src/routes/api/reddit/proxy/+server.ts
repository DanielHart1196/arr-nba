import { error, json } from '@sveltejs/kit';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

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
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
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
