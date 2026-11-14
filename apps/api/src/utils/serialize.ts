/** Convert Date fields to ISO strings for API responses. */
export function serializeDates<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (current instanceof Date) {
        return current.toISOString();
      }
      return current;
    }),
  ) as T;
}
