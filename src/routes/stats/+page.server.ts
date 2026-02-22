import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const qs = url.searchParams.toString();
  throw redirect(307, qs ? `/leaders?${qs}` : '/leaders');
};
