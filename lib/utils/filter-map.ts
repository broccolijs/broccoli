export default function filterMap<T>(iterator: Iterable<T>, cb: (entry: T) => boolean) {
  const result = [];
  for (const entry of iterator) {
    if (cb(entry)) {
      result.push(entry);
    }
  }
  return result;
};
