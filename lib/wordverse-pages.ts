// Read every page rather than relying on the API's default row limit.
export async function wordversePages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const {data,error} = await read(from,from+pageSize-1);
    if (error) throw new Error("Unable to load the complete Wordverse network.");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
