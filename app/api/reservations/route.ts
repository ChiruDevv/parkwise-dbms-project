import { NextRequest, NextResponse } from "next/server";
import { getSession, sameOrigin } from "@/lib/auth";
import { getSqlPool } from "@/lib/db";
import { jsonError, message } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const user = await getSession();
  if (!user) return jsonError("Sign in to reserve a space.", 401);
  let connection;
  try {
    const body = await request.json();
    const lotId = Number(body.lotId);
    const vehicleNumber = String(body.vehicleNumber || "").trim().toUpperCase();
    const startTime = new Date(String(body.startTime || ""));
    const endTime = new Date(String(body.endTime || ""));
    const now = Date.now();
    if (!Number.isInteger(lotId) || lotId < 1) return jsonError("Choose a valid parking location.");
    if (!/^[A-Z0-9 -]{3,30}$/.test(vehicleNumber)) return jsonError("Enter a valid vehicle number.");
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) return jsonError("Choose a valid start and end time.");
    if (startTime.getTime() < now - 60_000 || endTime <= startTime) return jsonError("Choose a future start time and an end time after it.");
    if (endTime.getTime() - startTime.getTime() > 24 * 60 * 60_000) return jsonError("A reservation can be up to 24 hours long.");
    const hourlyRate = Number(process.env.PARKING_RATE_PER_HOUR || 50);
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return jsonError("Parking hourly rate is not configured.", 503);
    const estimatedCharge = Number((hourlyRate * (endTime.getTime() - startTime.getTime()) / 3_600_000).toFixed(2));

    connection = await getSqlPool().getConnection();
    await connection.beginTransaction();
    const [slots] = await connection.execute<any[]>("SELECT Slot_ID, Slot_Number FROM parking_slot WHERE Lot_ID = ? AND Status = 'Available' ORDER BY Slot_Number LIMIT 1 FOR UPDATE", [lotId]);
    if (!slots.length) { await connection.rollback(); return jsonError("There are no available spaces at this location.", 409); }
    const slot = slots[0];
    const [conflicts] = await connection.execute<any[]>(`SELECT Reservation_ID FROM reservation WHERE Slot_ID = ? AND Status = 'Active'
      AND Start_Time < ? AND End_Time > ? LIMIT 1`, [slot.Slot_ID, endTime, startTime]);
    if (conflicts.length) { await connection.rollback(); return jsonError("That space has a reservation during your selected time. Please try again.", 409); }
    const [vehicles] = await connection.execute<any[]>("SELECT Vehicle_ID, User_ID FROM vehicle WHERE Vehicle_Number = ? LIMIT 1 FOR UPDATE", [vehicleNumber]);
    let vehicleId: number;
    if (vehicles.length && Number(vehicles[0].User_ID) !== user.id) { await connection.rollback(); return jsonError("This vehicle is linked to another account.", 403); }
    if (vehicles.length) vehicleId = vehicles[0].Vehicle_ID;
    else {
      const [created] = await connection.execute<any>("INSERT INTO vehicle (User_ID, Vehicle_Number, Vehicle_Type) VALUES (?, ?, 'Car')", [user.id, vehicleNumber]);
      vehicleId = Number(created.insertId);
    }
    const [created] = await connection.execute<any>(`INSERT INTO reservation
      (User_ID, Slot_ID, Vehicle_ID, Start_Time, End_Time, Hourly_Rate, Estimated_Charge, Status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`, [user.id, slot.Slot_ID, vehicleId, sqlDate(startTime), sqlDate(endTime), hourlyRate, estimatedCharge]);
    await connection.execute("UPDATE parking_slot SET Status = 'Occupied' WHERE Slot_ID = ? AND Status = 'Available'", [slot.Slot_ID]);
    await connection.commit();
    return NextResponse.json({ ok: true, reservationId: created.insertId }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(message(error), 503);
  } finally { connection?.release(); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const user = await getSession();
  if (!user) return jsonError("Sign in to cancel a reservation.", 401);

  let connection;
  try {
    const body = await request.json();
    const reservationId = Number(body.reservationId);
    if (!Number.isInteger(reservationId) || reservationId < 1) return jsonError("Choose a valid reservation.");

    connection = await getSqlPool().getConnection();
    await connection.beginTransaction();

    const access = [user.role, user.id];
    const [matches] = await connection.execute<any[]>(`SELECT Slot_ID FROM reservation
      WHERE Reservation_ID = ? AND (? = 'Admin' OR User_ID = ?) LIMIT 1`, [reservationId, ...access]);
    if (!matches.length) {
      await connection.rollback();
      return jsonError("Reservation not found.", 404);
    }

    const slotId = Number(matches[0].Slot_ID);
    const [slots] = await connection.execute<any[]>("SELECT Status FROM parking_slot WHERE Slot_ID = ? FOR UPDATE", [slotId]);
    const [reservations] = await connection.execute<any[]>(`SELECT Status FROM reservation
      WHERE Reservation_ID = ? AND (? = 'Admin' OR User_ID = ?) FOR UPDATE`, [reservationId, ...access]);
    if (!reservations.length) {
      await connection.rollback();
      return jsonError("Reservation not found.", 404);
    }
    if (reservations[0].Status !== "Active") {
      await connection.rollback();
      return jsonError("Only active reservations can be cancelled.", 409);
    }

    const [otherActive] = await connection.execute<any[]>(`SELECT Reservation_ID FROM reservation
      WHERE Slot_ID = ? AND Status = 'Active' AND Reservation_ID <> ? LIMIT 1`, [slotId, reservationId]);
    await connection.execute("UPDATE reservation SET Status = 'Cancelled' WHERE Reservation_ID = ?", [reservationId]);
    if (!otherActive.length && slots[0] && ["Occupied", "Reserved"].includes(slots[0].Status)) {
      await connection.execute("UPDATE parking_slot SET Status = 'Available' WHERE Slot_ID = ?", [slotId]);
    }

    await connection.commit();
    return NextResponse.json({ ok: true, reservationId });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(message(error), 503);
  } finally {
    connection?.release();
  }
}

function sqlDate(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}
