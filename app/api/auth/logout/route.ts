import { NextRequest, NextResponse } from "next/server";
import { clearSession, sameOrigin } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
