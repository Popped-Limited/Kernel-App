/**
 * Fetch every row of a Supabase select, paginating past PostgREST's 1000-row
 * cap. Pass a builder that applies `.range(from, to)` to the query (everything
 * else — filters, ordering, joins — set up inside the builder). Without this,
 * any un-ranged `.select()` silently stops at 1000 rows, so a large org's older
 * records vanish from whatever the caller computes (stock totals, history, …).
 *
 *   const rows = await fetchAll((from, to) =>
 *     supabase.from("dispatches").select("*").order("dispatch_date").range(from, to));
 */
const PAGE = 1000;

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}
