export async function collectPageResults<T>(requests: Promise<T>[]) {
  const results = await Promise.allSettled(requests);
  const values: T[] = [];
  let failedCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") values.push(result.value);
    else failedCount += 1;
  }
  if (failedCount > 0 && values.length === 0) {
    throw new Error(`All ${failedCount} screening pages failed to load`);
  }
  return { values, failedCount };
}
