import { redirect } from '@sveltejs/kit';

export const load = async ({ url }: { url: URL }) => {
  const qs = url.searchParams.toString();
  throw redirect(307, qs ? `/stats?${qs}` : '/stats');
};

