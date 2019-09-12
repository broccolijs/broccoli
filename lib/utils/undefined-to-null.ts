// Replace all `undefined` values with `null`, so that they show up in JSON output
export default function undefinedToNull(obj: { [index: string]: NonNullable<any> }) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && obj[key] === undefined) {
      obj[key] = null;
    }
  }
  return obj;
};
