import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { setSession, sameOrigin } from "@/lib/auth";
import { getSqlPool } from "@/lib/db";
import { jsonError, message } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return jsonError("Enter your email and password.");
    const [rows] = await getSqlPool().execute<any[]>("SELECT User_ID, Name, Email, Password, Role FROM `user` WHERE Email = ? LIMIT 1", [email]);
    const account = rows[0];
    if (!account?.Password || !(await compare(password, account.Password))) return jsonError("Email or password is incorrect.", 401);
    const user = { id: account.User_ID, name: account.Name, email: account.Email, role: account.Role === "Admin" ? "Admin" as const : "User" as const };
    const response = NextResponse.json({ user });
    setSession(response, user);
    return response;
  } catch (error) { return jsonError(message(error), 503); }
}
