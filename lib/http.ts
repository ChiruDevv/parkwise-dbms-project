import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function message(error: unknown) {
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}
