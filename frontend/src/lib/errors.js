/**
 * Extract a user-friendly error message from an axios/FastAPI error.
 * FastAPI 422 returns detail as an array of {type, loc, msg, input, ctx}.
 */
export const errMsg = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) {
    return d.map((x) => `${x.loc?.slice(-1)[0] || ""}: ${x.msg}`).join(", ");
  }
  return fallback;
};
