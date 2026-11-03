import { NextRequest, NextResponse } from "next/server";
import { getSession, sameOrigin } from "@/lib/auth";
import { getSqlPool } from "@/lib/db";
import { jsonError, message } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ slotId: string }> }) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const user = await getSession();
  if (!user) return jsonError("Sign in to continue.", 401);
  if (user.role !== "Admin") return jsonError("Admin access is required.", 403);
  try {
    const slotId = Number((await context.params).slotId);
    const body = await request.json();
    const status = String(body.status || "");
    if (!Number.isInteger(slotId) || slotId < 1 || !["Available", "Maintenance"].includes(status)) return jsonError("Choose a valid space and status.");
    const [result] = await getSqlPool().execute<any>("UPDATE parking_slot SET Status = ? WHERE Slot_ID = ? AND Status IN ('Available', 'Maintenance')", [status, slotId]);
    if (!result.affectedRows) return jsonError("Space not found or currently reserved.", 409);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(message(error), 503); }
}
