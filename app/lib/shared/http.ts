export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ message: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return Response.json({ message }, { status: 500 });
}

export function assertString(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new HttpError(400, `${label} is required.`);
  }
  return normalized;
}

export function optionalString(value: unknown) {
  return String(value ?? "").trim();
}
