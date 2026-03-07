export const LIMITS = {
  maxUploadBytes: 20 * 1024 * 1024,
  maxJobsPerIpPerDay: 10,
};

export function validateUpload(input: { sizeBytes: number }):
  | { ok: true }
  | { ok: false; code: "ERR_INVALID_FILE" } {
  if (input.sizeBytes > LIMITS.maxUploadBytes) {
    return {
      ok: false,
      code: "ERR_INVALID_FILE",
    };
  }

  return { ok: true };
}
