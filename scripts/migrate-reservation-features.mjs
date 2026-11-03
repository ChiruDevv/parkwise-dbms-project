import mysql from "mysql2/promise";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "parkwise",
});

try {
  const rate = Number(process.env.PARKING_RATE_PER_HOUR || 50);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("PARKING_RATE_PER_HOUR must be greater than 0.");

  const [columns] = await connection.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservation'`);
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  let addedRate = false;
  let addedEstimate = false;

  if (!existing.has("Hourly_Rate")) {
    await connection.execute(`ALTER TABLE reservation ADD COLUMN Hourly_Rate DECIMAL(10,2) NOT NULL DEFAULT ${rate.toFixed(2)}`);
    addedRate = true;
  }
  if (!existing.has("Estimated_Charge")) {
    await connection.execute("ALTER TABLE reservation ADD COLUMN Estimated_Charge DECIMAL(10,2) NOT NULL DEFAULT 0.00");
    addedEstimate = true;
  }
  if (addedEstimate) {
    await connection.execute(`UPDATE reservation SET Estimated_Charge = ROUND(TIMESTAMPDIFF(SECOND, Start_Time, End_Time) / 3600 * Hourly_Rate, 2)`);
  }

  await connection.execute(`CREATE TABLE IF NOT EXISTS reservation_reminder (
    Reservation_ID INT NOT NULL PRIMARY KEY,
    Status ENUM('Sending', 'Sent') NOT NULL DEFAULT 'Sending',
    Claimed_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Sent_At DATETIME NULL,
    CONSTRAINT fk_reservation_reminder_reservation
      FOREIGN KEY (Reservation_ID) REFERENCES reservation(Reservation_ID) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  console.log(`Reservation feature migration complete. Hourly rate: ₹${rate.toFixed(2)}.`);
  if (!addedRate && !addedEstimate) console.log("Pricing columns already existed; existing charges were preserved.");
} finally {
  await connection.end();
}
