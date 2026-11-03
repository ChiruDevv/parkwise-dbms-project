import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMongoDb, getSqlPool, sensorCollectionName } from "@/lib/db";
import { jsonError, message } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in to continue.", 401);
  try {
    const pool = getSqlPool();
    const [capacityFields] = await pool.execute<any[]>(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parking_lot' AND COLUMN_NAME IN ('Capacity', 'Total_Slots')`);
    const capacityField = capacityFields.some((row) => row.COLUMN_NAME === "Capacity") ? "Capacity" : "Total_Slots";
    if (!capacityFields.some((row) => row.COLUMN_NAME === capacityField)) throw new Error("The parking_lot table needs a Capacity or Total_Slots column.");
    const [slotRows] = await pool.execute<any[]>(`SELECT pl.Lot_ID, pl.Lot_Name, pl.Location, pl.${capacityField} AS Lot_Capacity,
      ps.Slot_ID, ps.Slot_Number, ps.Status
      FROM parking_lot pl LEFT JOIN parking_slot ps ON ps.Lot_ID = pl.Lot_ID ORDER BY pl.Lot_ID, ps.Slot_Number`);
    const [reservationRows] = await pool.execute<any[]>(`SELECT r.Reservation_ID, r.Start_Time, r.End_Time, r.Status,
      r.Hourly_Rate, r.Estimated_Charge,
      pl.Lot_Name, pl.Location, ps.Slot_Number, v.Vehicle_Number, u.Name AS Customer_Name,
      p.Amount, p.Payment_Status, r.User_ID
      FROM reservation r JOIN parking_slot ps ON ps.Slot_ID = r.Slot_ID JOIN parking_lot pl ON pl.Lot_ID = ps.Lot_ID
      JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID JOIN \`user\` u ON u.User_ID = r.User_ID
      LEFT JOIN payment p ON p.Reservation_ID = r.Reservation_ID
      WHERE (? = 'Admin' OR r.User_ID = ?) ORDER BY r.Start_Time DESC LIMIT 30`, [user.role, user.id]);
    const [activityRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS ActiveReservations FROM reservation
      WHERE Status = 'Active' AND End_Time > NOW() AND (? = 'Admin' OR User_ID = ?)`, [user.role, user.id]);
    const [paymentRows] = await pool.execute<any[]>(`SELECT COALESCE(SUM(p.Amount), 0) AS Revenue FROM payment p
      JOIN reservation r ON r.Reservation_ID = p.Reservation_ID
      WHERE p.Payment_Status = 'Paid' AND (? = 'Admin' OR r.User_ID = ?)`, [user.role, user.id]);

    let mongo = null;
    let sensors: any[] = [];
    try {
      mongo = await getMongoDb();
      if (mongo) {
        sensors = await mongo.collection(sensorCollectionName()).find({}, { projection: { sensor_id: 1, sensorId: 1, lot_id: 1, lotId: 1, slot_id: 1, slotId: 1, sensor_status: 1, status: 1, vehicle_detected: 1, vehicleDetected: 1, timestamp: 1 } }).sort({ timestamp: -1 }).limit(20).toArray();
      }
    } catch { mongo = null; sensors = []; }

    const lotsMap = new Map<number, any>();
    for (const row of slotRows) {
      let lot = lotsMap.get(row.Lot_ID);
      if (!lot) {
        lot = { lotId: row.Lot_ID, name: row.Lot_Name, location: row.Location || "", capacity: Number(row.Lot_Capacity), occupied: 0, available: 0, maintenance: 0, slots: [] as any[] };
        lotsMap.set(row.Lot_ID, lot);
      }
      if (row.Slot_ID) {
        lot.slots.push({ slotId: row.Slot_ID, number: row.Slot_Number, status: row.Status });
        if (row.Status === "Available") lot.available++;
        else if (row.Status === "Maintenance") lot.maintenance++;
        else lot.occupied++;
      }
    }
    const lots = [...lotsMap.values()];
    const total = lots.reduce((sum, lot) => sum + lot.slots.length, 0);
    const occupied = lots.reduce((sum, lot) => sum + lot.occupied, 0);
    const sensorData: any[] = [];
    const seenSensors = new Set<string>();
    for (const sensor of sensors) {
      const sensorId = String(sensor.sensor_id || sensor.sensorId || "Sensor");
      if (seenSensors.has(sensorId)) continue;
      seenSensors.add(sensorId);
      sensorData.push({
        sensorId,
        slotId: Number(sensor.slot_id ?? sensor.slotId ?? 0),
        lotId: Number(sensor.lot_id ?? sensor.lotId ?? 0),
        status: sensor.sensor_status || sensor.status || "Unknown",
        vehicleDetected: Boolean(sensor.vehicle_detected ?? sensor.vehicleDetected),
        timestamp: new Date(sensor.timestamp?.$date || sensor.timestamp || Date.now()).toISOString(),
      });
    }
    const sensorBySlot = new Map(sensorData.map((sensor) => [sensor.slotId, sensor]));
    const sensorConflicts = lots.flatMap((lot) => lot.slots).filter((slot) => {
      const sensor = sensorBySlot.get(slot.slotId);
      return sensor && sensor.status.toLowerCase() === "working" && ((slot.status === "Available" && sensor.vehicleDetected) || (slot.status === "Occupied" && !sensor.vehicleDetected));
    }).length;
    const reservations = reservationRows.map((row) => ({ reservationId: row.Reservation_ID, lotName: row.Lot_Name, location: row.Location, slot: row.Slot_Number, start: mysqlDateToIso(row.Start_Time), end: mysqlDateToIso(row.End_Time), status: row.Status, vehicle: row.Vehicle_Number, customer: row.Customer_Name, hourlyRate: Number(row.Hourly_Rate), estimatedCharge: Number(row.Estimated_Charge), amount: Number(row.Amount || 0), paymentStatus: row.Payment_Status || "Pending" }));
    const stats = {
      available: lots.reduce((sum, lot) => sum + lot.available, 0),
      occupied,
      capacity: total,
      reservations: Number(activityRows[0]?.ActiveReservations || 0),
      revenue: Number(paymentRows[0]?.Revenue || 0),
      occupancy: total ? (occupied / total) * 100 : 0,
    };
    const configuredRate = Number(process.env.PARKING_RATE_PER_HOUR || 50);
    const ratePerHour = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 50;
    return NextResponse.json({ user, dashboard: {
      stats, lots, sensors: sensorData, reservations, sensorConnection: Boolean(mongo), sensorConflicts, ratePerHour,
      remindersEnabled: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    } });
  } catch (error) { return jsonError(message(error), 503); }
}

function mysqlDateToIso(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`).toISOString();
}
