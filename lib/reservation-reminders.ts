import { getSqlPool } from "@/lib/db";

type DueReservation = {
  Reservation_ID: number;
  Start_Time: string;
  End_Time: string;
  Customer_Name: string;
  Email: string;
  Lot_Name: string;
  Slot_Number: string;
  Vehicle_Number: string;
  Estimated_Charge: number;
  Hourly_Rate: number;
};

let reminderTableReady: Promise<void> | undefined;
let missingConfigLogged = false;

export async function processDueReservationReminders() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (!missingConfigLogged) {
      console.info("ParkWise email reminders are paused. Configure RESEND_API_KEY and EMAIL_FROM in .env.local.");
      missingConfigLogged = true;
    }
    return;
  }

  const pool = getSqlPool();
  if (!reminderTableReady) {
    reminderTableReady = pool.execute(`CREATE TABLE IF NOT EXISTS reservation_reminder (
      Reservation_ID INT NOT NULL PRIMARY KEY,
      Status ENUM('Sending', 'Sent') NOT NULL DEFAULT 'Sending',
      Claimed_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      Sent_At DATETIME NULL,
      CONSTRAINT fk_reservation_reminder_reservation
        FOREIGN KEY (Reservation_ID) REFERENCES reservation(Reservation_ID) ON DELETE CASCADE
    ) ENGINE=InnoDB`).then(() => undefined).catch((error) => {
      reminderTableReady = undefined;
      throw error;
    });
  }
  await reminderTableReady;

  const rawLead = Number(process.env.REMINDER_LEAD_MINUTES || 60);
  const leadMinutes = Number.isInteger(rawLead) && rawLead >= 5 && rawLead <= 1440 ? rawLead : 60;
  const [rows] = await pool.execute<any[]>(`SELECT r.Reservation_ID, r.Start_Time, r.End_Time,
      r.Estimated_Charge, r.Hourly_Rate, u.Name AS Customer_Name, u.Email,
      pl.Lot_Name, ps.Slot_Number, v.Vehicle_Number
    FROM reservation r
    JOIN \`user\` u ON u.User_ID = r.User_ID
    JOIN parking_slot ps ON ps.Slot_ID = r.Slot_ID
    JOIN parking_lot pl ON pl.Lot_ID = ps.Lot_ID
    JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
    LEFT JOIN reservation_reminder rr ON rr.Reservation_ID = r.Reservation_ID AND rr.Status = 'Sent'
    WHERE r.Status = 'Active'
      AND r.Start_Time > UTC_TIMESTAMP()
      AND r.Start_Time <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
      AND rr.Reservation_ID IS NULL
    ORDER BY r.Start_Time ASC LIMIT 50`, [leadMinutes]);

  for (const reservation of rows) {
    const [claim] = await pool.execute<any>(`INSERT IGNORE INTO reservation_reminder
      (Reservation_ID, Status, Claimed_At) VALUES (?, 'Sending', UTC_TIMESTAMP())`, [reservation.Reservation_ID]);
    if (claim.affectedRows !== 1) {
      const [retry] = await pool.execute<any>(`UPDATE reservation_reminder SET Status = 'Sending',
        Claimed_At = UTC_TIMESTAMP(), Sent_At = NULL
        WHERE Reservation_ID = ? AND Status = 'Sending'
          AND Claimed_At < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)`, [reservation.Reservation_ID]);
      if (retry.affectedRows !== 1) continue;
    }

    try {
      await sendReminder(reservation, apiKey, from);
      await pool.execute(`UPDATE reservation_reminder SET Status = 'Sent', Sent_At = UTC_TIMESTAMP()
        WHERE Reservation_ID = ? AND Status = 'Sending'`, [reservation.Reservation_ID]);
      console.info(`Sent ParkWise reminder for reservation ${reservation.Reservation_ID}.`);
    } catch (error) {
      await pool.execute("DELETE FROM reservation_reminder WHERE Reservation_ID = ? AND Status = 'Sending'", [reservation.Reservation_ID]);
      console.error(`Could not send ParkWise reminder for reservation ${reservation.Reservation_ID}:`, error);
    }
  }
}

async function sendReminder(reservation: DueReservation, apiKey: string, from: string) {
  const start = new Date(reservation.Start_Time.replace(" ", "T") + "Z");
  const end = new Date(reservation.End_Time.replace(" ", "T") + "Z");
  const formatTime = (value: Date) => new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(value);
  const name = escapeHtml(reservation.Customer_Name);
  const lot = escapeHtml(reservation.Lot_Name);
  const slot = escapeHtml(reservation.Slot_Number);
  const vehicle = escapeHtml(reservation.Vehicle_Number);
  const startLabel = formatTime(start);
  const endLabel = formatTime(end);
  const rate = Number(reservation.Hourly_Rate);
  const charge = Number(reservation.Estimated_Charge);
  const text = `Hi ${reservation.Customer_Name}, your ParkWise reservation is coming up.\n\n${reservation.Lot_Name}, space ${reservation.Slot_Number}\nVehicle: ${reservation.Vehicle_Number}\nStart: ${startLabel}\nEnd: ${endLabel}\nEstimated charge: ₹${charge.toFixed(2)} (${rate.toFixed(2)}/hour)\n\nWe look forward to seeing you.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#19251f;max-width:560px;margin:auto;padding:28px">
    <div style="color:#34785d;font-weight:700;letter-spacing:.4px">PARKWISE</div>
    <h1 style="font-size:24px;margin:20px 0 8px">Your parking is coming up</h1>
    <p>Hi ${name}, here are the details for your upcoming reservation.</p>
    <div style="background:#f6f9f6;border:1px solid #e9ede9;border-radius:12px;padding:18px;margin:20px 0">
      <b>${lot} · Space ${slot}</b><br><span>Vehicle: ${vehicle}</span><br>
      <span>Start: ${escapeHtml(startLabel)}</span><br><span>End: ${escapeHtml(endLabel)}</span><br>
      <span>Estimated charge: ₹${charge.toFixed(2)} (₹${rate.toFixed(2)}/hour)</span>
    </div><p>We look forward to seeing you.</p>
  </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `parkwise-reservation-reminder-${reservation.Reservation_ID}`,
    },
    body: JSON.stringify({ from, to: [reservation.Email], subject: "Your ParkWise reservation is coming up", text, html }),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}: ${await response.text()}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
