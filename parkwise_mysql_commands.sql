-- Smart Parking Management & Occupancy Prediction System
-- Consolidated MySQL script for the commands and database work completed so far.
-- Database: parkwise
--
-- IMPORTANT:
-- 1. This is a reconstructed, reusable script based on the commands we discussed,
--    not a literal export of your terminal history.
-- 2. It drops and recreates the parkwise database. Run only if you are happy to
--    replace an existing parkwise database, or ask your teammate to import it into
--    a fresh local MySQL instance.
-- 3. The MongoDB commands/data are NOT included in this MySQL-only file.

DROP DATABASE IF EXISTS parkwise;
CREATE DATABASE parkwise;
USE parkwise;

-- =========================================================
-- 1. TABLES (DDL)
-- =========================================================

CREATE TABLE `user` (
    User_ID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(150) NOT NULL UNIQUE,
    Phone VARCHAR(20),
    Password VARCHAR(255),
    Role VARCHAR(30) NOT NULL DEFAULT 'User'
);

CREATE TABLE parking_lot (
    Lot_ID INT AUTO_INCREMENT PRIMARY KEY,
    Lot_Name VARCHAR(150) NOT NULL,
    Location VARCHAR(255),
    Capacity INT NOT NULL DEFAULT 0
);

CREATE TABLE parking_slot (
    Slot_ID INT AUTO_INCREMENT PRIMARY KEY,
    Lot_ID INT NOT NULL,
    Slot_Number VARCHAR(20) NOT NULL,
    Status ENUM('Available', 'Occupied', 'Reserved', 'Maintenance') NOT NULL DEFAULT 'Available',
    Last_Inspected DATE NULL,
    CONSTRAINT fk_parking_slot_lot
        FOREIGN KEY (Lot_ID) REFERENCES parking_lot(Lot_ID),
    CONSTRAINT uq_lot_slot_number UNIQUE (Lot_ID, Slot_Number)
);

CREATE TABLE parking_staff (
    Staff_ID INT AUTO_INCREMENT PRIMARY KEY,
    Lot_ID INT NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Role VARCHAR(50) NOT NULL,
    Phone VARCHAR(20),
    CONSTRAINT fk_parking_staff_lot
        FOREIGN KEY (Lot_ID) REFERENCES parking_lot(Lot_ID)
);

CREATE TABLE vehicle (
    Vehicle_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL,
    Vehicle_Number VARCHAR(30) NOT NULL UNIQUE,
    Vehicle_Type VARCHAR(50),
    CONSTRAINT fk_vehicle_user
        FOREIGN KEY (User_ID) REFERENCES `user`(User_ID)
);

CREATE TABLE reservation (
    Reservation_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL,
    Slot_ID INT NOT NULL,
    Vehicle_ID INT NOT NULL,
    Start_Time DATETIME NOT NULL,
    End_Time DATETIME NOT NULL,
    Hourly_Rate DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    Estimated_Charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    Status ENUM('Active', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Active',
    CONSTRAINT fk_reservation_user
        FOREIGN KEY (User_ID) REFERENCES `user`(User_ID),
    CONSTRAINT fk_reservation_slot
        FOREIGN KEY (Slot_ID) REFERENCES parking_slot(Slot_ID),
    CONSTRAINT fk_reservation_vehicle
        FOREIGN KEY (Vehicle_ID) REFERENCES vehicle(Vehicle_ID)
);

CREATE TABLE payment (
    Payment_ID INT AUTO_INCREMENT PRIMARY KEY,
    Reservation_ID INT NOT NULL UNIQUE,
    Amount DECIMAL(10,2) NOT NULL,
    Payment_Method VARCHAR(30) NOT NULL,
    Payment_Status ENUM('Pending', 'Paid', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
    Payment_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_reservation
        FOREIGN KEY (Reservation_ID) REFERENCES reservation(Reservation_ID)
);

CREATE TABLE reservation_reminder (
    Reservation_ID INT NOT NULL PRIMARY KEY,
    Status ENUM('Sending', 'Sent') NOT NULL DEFAULT 'Sending',
    Claimed_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Sent_At DATETIME NULL,
    CONSTRAINT fk_reservation_reminder_reservation
        FOREIGN KEY (Reservation_ID) REFERENCES reservation(Reservation_ID) ON DELETE CASCADE
);

-- =========================================================
-- 2. SAMPLE DATA (DML)
-- =========================================================

INSERT INTO `user` (User_ID, Name, Email, Phone, Password, Role) VALUES
(1, 'Aarav Sharma', 'aarav@example.com', '9000000001', NULL, 'User'),
(2, 'Diya Patel', 'diya@example.com', '9000000002', NULL, 'User'),
(3, 'Admin User', 'admin@example.com', '9000000003', NULL, 'Admin');

INSERT INTO parking_lot (Lot_ID, Lot_Name, Location, Capacity) VALUES
(1, 'Central Mall Parking', 'Central Mall', 3),
(2, 'Tech Park Parking', 'Technology Park', 2);

INSERT INTO parking_slot (Slot_ID, Lot_ID, Slot_Number, Status, Last_Inspected) VALUES
(1, 1, 'A01', 'Occupied', NULL),
(2, 1, 'A02', 'Available', NULL),
(3, 1, 'A03', 'Available', NULL),
(4, 2, 'B01', 'Occupied', NULL),
(5, 2, 'B02', 'Available', NULL);

INSERT INTO vehicle (Vehicle_ID, User_ID, Vehicle_Number, Vehicle_Type) VALUES
(1, 1, 'KA01AB1234', 'Car'),
(2, 2, 'KA03CD5678', 'Car');

INSERT INTO reservation
(Reservation_ID, User_ID, Slot_ID, Vehicle_ID, Start_Time, End_Time, Status) VALUES
(1, 1, 1, 1, '2026-10-26 09:00:00', '2026-10-26 11:00:00', 'Active'),
(2, 2, 4, 2, '2026-10-26 10:00:00', '2026-10-26 12:00:00', 'Active');

INSERT INTO payment
(Payment_ID, Reservation_ID, Amount, Payment_Method, Payment_Status) VALUES
(1, 1, 100.00, 'Card', 'Paid'),
(2, 2, 50.00, 'UPI', 'Paid');

INSERT INTO parking_staff (Staff_ID, Lot_ID, Name, Role, Phone) VALUES
(1, 1, 'Rohan Mehta', 'Manager', '9000000011');

-- =========================================================
-- 3. BASIC CHECKS / SELECT QUERIES
-- =========================================================

SHOW TABLES;

SELECT * FROM `user`;
SELECT * FROM parking_lot;
SELECT * FROM parking_slot;
SELECT * FROM parking_staff;
SELECT * FROM vehicle;
SELECT * FROM reservation;
SELECT * FROM payment;

-- Inspect foreign-key relationships in this database.
SELECT
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'parkwise'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;

-- Joined reservation report.
SELECT
    r.Reservation_ID,
    u.Name AS Customer_Name,
    v.Vehicle_Number,
    pl.Lot_Name,
    ps.Slot_Number,
    r.Start_Time,
    r.End_Time,
    r.Status AS Reservation_Status,
    p.Amount,
    p.Payment_Method,
    p.Payment_Status
FROM reservation r
JOIN `user` u ON r.User_ID = u.User_ID
JOIN vehicle v ON r.Vehicle_ID = v.Vehicle_ID
JOIN parking_slot ps ON r.Slot_ID = ps.Slot_ID
JOIN parking_lot pl ON ps.Lot_ID = pl.Lot_ID
LEFT JOIN payment p ON p.Reservation_ID = r.Reservation_ID
ORDER BY r.Start_Time;

-- Count slots in each parking lot.
SELECT
    pl.Lot_ID,
    pl.Lot_Name,
    COUNT(ps.Slot_ID) AS Total_Slots
FROM parking_lot pl
LEFT JOIN parking_slot ps ON ps.Lot_ID = pl.Lot_ID
GROUP BY pl.Lot_ID, pl.Lot_Name
ORDER BY pl.Lot_ID;

-- Total successful payments per parking lot.
SELECT
    pl.Lot_Name,
    SUM(p.Amount) AS Total_Paid
FROM payment p
JOIN reservation r ON p.Reservation_ID = r.Reservation_ID
JOIN parking_slot ps ON r.Slot_ID = ps.Slot_ID
JOIN parking_lot pl ON ps.Lot_ID = pl.Lot_ID
WHERE p.Payment_Status = 'Paid'
GROUP BY pl.Lot_ID, pl.Lot_Name
ORDER BY Total_Paid DESC;

-- List available slots.
SELECT
    pl.Lot_Name,
    ps.Slot_Number,
    ps.Status
FROM parking_slot ps
JOIN parking_lot pl ON ps.Lot_ID = pl.Lot_ID
WHERE ps.Status = 'Available'
ORDER BY pl.Lot_Name, ps.Slot_Number;

-- Example UPDATE command used to mark a slot as occupied.
-- The sample data already marks slot 1 as Occupied.
UPDATE parking_slot
SET Status = 'Occupied'
WHERE Slot_ID = 1;

-- Sort reservations by start time.
SELECT *
FROM reservation
ORDER BY Start_Time DESC;

-- HAVING example: show lots with more than one slot.
SELECT
    pl.Lot_Name,
    COUNT(ps.Slot_ID) AS Total_Slots
FROM parking_lot pl
JOIN parking_slot ps ON ps.Lot_ID = pl.Lot_ID
GROUP BY pl.Lot_ID, pl.Lot_Name
HAVING COUNT(ps.Slot_ID) > 1;

-- Subquery: users who have at least one reservation.
SELECT User_ID, Name
FROM `user`
WHERE User_ID IN (
    SELECT User_ID
    FROM reservation
);

-- =========================================================
-- 4. ADVANCED FEATURE 1: VIEW
-- =========================================================

CREATE VIEW reservation_details AS
SELECT
    r.Reservation_ID,
    u.Name AS Customer_Name,
    v.Vehicle_Number,
    pl.Lot_Name,
    ps.Slot_Number,
    r.Start_Time,
    r.End_Time,
    r.Status AS Reservation_Status
FROM reservation r
JOIN `user` u ON r.User_ID = u.User_ID
JOIN vehicle v ON r.Vehicle_ID = v.Vehicle_ID
JOIN parking_slot ps ON r.Slot_ID = ps.Slot_ID
JOIN parking_lot pl ON ps.Lot_ID = pl.Lot_ID;

SELECT * FROM reservation_details;

-- =========================================================
-- 5. ADVANCED FEATURE 2: INDEX
-- =========================================================

CREATE INDEX idx_reservation_start_time
ON reservation (Start_Time);

SHOW INDEX FROM reservation;

-- =========================================================
-- 6. ADVANCED FEATURE 3: TRIGGER
--    When an Active reservation is inserted, mark its slot Occupied.
-- =========================================================

DELIMITER //

CREATE TRIGGER after_reservation_insert
AFTER INSERT ON reservation
FOR EACH ROW
BEGIN
    IF NEW.Status = 'Active' THEN
        UPDATE parking_slot
        SET Status = 'Occupied'
        WHERE Slot_ID = NEW.Slot_ID;
    END IF;
END //

DELIMITER ;

SHOW TRIGGERS;

-- Trigger test: insert a new Active reservation for available slot 2.
-- This uses a new reservation ID (3) and the existing user/vehicle IDs.
INSERT INTO reservation
(Reservation_ID, User_ID, Slot_ID, Vehicle_ID, Start_Time, End_Time, Status)
VALUES
(3, 1, 2, 1, '2026-10-27 09:00:00', '2026-10-27 10:00:00', 'Active');

-- Confirm the trigger changed slot 2 to Occupied.
SELECT Slot_ID, Slot_Number, Status
FROM parking_slot
WHERE Slot_ID = 2;

SELECT * FROM reservation_details ORDER BY Reservation_ID;

-- =========================================================
-- 7. OPTIONAL SAFE DEMO TABLE TEST
--    This reproduces the create/drop demonstration without affecting project data.
-- =========================================================

CREATE TABLE drop_demo (
    Demo_ID INT PRIMARY KEY,
    Demo_Name VARCHAR(50)
);

DROP TABLE drop_demo;

-- =========================================================
-- 8. FINAL VERIFICATION
-- =========================================================

SHOW TABLES;
SELECT COUNT(*) AS Total_Users FROM `user`;
SELECT COUNT(*) AS Total_Lots FROM parking_lot;
SELECT COUNT(*) AS Total_Slots FROM parking_slot;
SELECT COUNT(*) AS Total_Vehicles FROM vehicle;
SELECT COUNT(*) AS Total_Reservations FROM reservation;
SELECT COUNT(*) AS Total_Payments FROM payment;
SELECT * FROM reservation_details ORDER BY Reservation_ID;
