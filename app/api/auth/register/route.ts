import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { setSession, sameOrigin } from "@/lib/auth";
import { getSqlPool } from "@/lib/db";
import { jsonError, message } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  let connection;
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();
    const vehicleNumber = String(body.vehicleNumber || "").trim().toUpperCase();
    if (name.length < 2 || name.length > 100) return jsonError("Enter a name between 2 and 100 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return jsonError("Enter a valid email address.");
    if (password.length < 8 || password.length > 100) return jsonError("Use a password between 8 and 100 characters.");
    if (!/^[0-9+() -]{7,20}$/.test(phone)) return jsonError("Enter a valid phone number.");
    if (!/^[A-Z0-9 -]{3,30}$/.test(vehicleNumber)) return jsonError("Enter a valid vehicle number.");
    const pool = getSqlPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute<any[]>("SELECT User_ID FROM `user` WHERE Email = ? LIMIT 1", [email]);
    if (existing.length) { await connection.rollback(); return jsonError("An account already exists for this email.", 409); }
    const role = email === String(process.env.ADMIN_EMAIL || "").trim().toLowerCase() ? "Admin" : "User";
    const passwordHash = await hash(password, 12);
    const [inserted] = await connection.execute<any>("INSERT INTO `user` (Name, Email, Phone, Password, Role) VALUES (?, ?, ?, ?, ?)", [name, email, phone, passwordHash, role]);
    const userId = Number(inserted.insertId);
    await connection.execute("INSERT INTO vehicle (User_ID, Vehicle_Number, Vehicle_Type) VALUES (?, ?, 'Car')", [userId, vehicleNumber]);
    await connection.commit();
    const user = { id: userId, name, email, role: role as "Admin" | "User" };
    const response = NextResponse.json({ user }, { status: 201 });
    setSession(response, user);
    return response;
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(message(error), 503);
  } finally { connection?.release(); }
}
