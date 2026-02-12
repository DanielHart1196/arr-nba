export const load = async ({ fetch, params }: any) => {
  const res = await fetch(`/api/boxscore/${params.id}`);
  const json = await res.json();
  return { id: params.id, ...json };
};
