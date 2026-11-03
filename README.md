# ParkWise

ParkWise is a Next.js web app for a smart parking project. It uses MySQL for accounts, vehicles, parking lots and spaces, reservations, and payment totals. It reads sensor status and vehicle detections from MongoDB.

## What the app does

- Shows live parking capacity, available spaces, reservation activity, and paid revenue from MySQL.
- Lets customers create an account, register a vehicle, and reserve an available space.
- Gives Admin accounts a space operations panel to mark spaces as under maintenance and return them to service.
- Shows a ₹50/hour parking rate, saves a per-reservation price estimate, and emails a reminder one hour before parking.
- Reads the latest sensor status from MongoDB and flags readings that disagree with MySQL slot status.
- Uses parameterized SQL, password hashing, a signed HTTP only session cookie, and environment variables for credentials.

## Requirements

- Node.js 20.9 or newer
- MySQL 8 with the ParkWise tables
- MongoDB for the sensor feed (optional while setting up; sensor readings remain unavailable until it is connected)

## Local setup

1. Install the project dependencies:

   ```powershell
   npm install
   ```

2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Fill in the MySQL and MongoDB connection values. Replace `SESSION_SECRET` with a random secret of at least 32 characters. Keep `.env.local` private; it is ignored by Git.

3. Set up MySQL from your team’s SQL script. **That script starts with `DROP DATABASE IF EXISTS parkwise` and recreates the database.** Only run it against a disposable local database or after confirming that existing `parkwise` data can be replaced. The app never runs the setup script automatically. The app supports both the reconstructed script’s `Capacity` column and the earlier schema screenshot’s `Total_Slots` column. New account registration asks for a phone number so it also works with the earlier schema’s required phone field.

4. Import the supplied sensor sample into MongoDB after setting `MONGODB_URI`:

   ```powershell
   npm run import:sensors
   ```

   The importer uses `data/PARKING_SENSOR_DATA.json` and writes to the database and collection named in `.env.local`.

5. Add the non-destructive reservation pricing/reminder schema changes to an existing MySQL database:

   ```powershell
   npm run db:migrate:reservation-features
   ```

   This adds hourly-rate and estimated-charge fields plus a reminder log table; it does not drop or recreate `parkwise`. The setup SQL also includes these fields for a fresh database.

6. Configure email reminders in `.env.local` with a Resend API key and a verified sender address. The app checks once per minute and sends a reminder one hour before an active reservation. Keep the Next.js server running for reminders to be processed. Email is disabled until both values are configured.

7. Start the app:

   ```powershell
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Accounts and access

Use **Create account** to register. Registration creates a user row with a bcrypt password hash and a vehicle row in one transaction. The email set in `ADMIN_EMAIL` gets the Admin role; all other new accounts get the User role. Use a new email for the Admin account because the supplied SQL sample already contains an `admin@example.com` account with no password hash.

The Admin role can be granted only through the environment configured admin email during registration. Space status updates are limited to `Available` and `Maintenance`; occupied spaces cannot be changed from the operations panel.

## Database notes

- User names, email addresses, phone numbers, bcrypt password hashes, vehicles, and reservations are stored in MySQL in the `parkwise` database. MongoDB stores only sensor readings. The application does not store payment-card details.
- The dashboard reads slot status and reservations from MySQL and sensor documents from MongoDB.
- New reservations are checked against the selected space and active reservation time window inside a MySQL transaction. The supplied trigger updates the selected space status to `Occupied` when an active reservation is inserted.
- The dashboard uses joins and aggregate queries for reservation details, capacity, active reservations, and paid revenue. The supplied SQL also defines the `reservation_details` view, a reservation start-time index, and an insert trigger.
- The hourly rate is configured with `PARKING_RATE_PER_HOUR` (currently ₹50). Reservation estimates are prorated by duration and stored when the reservation is created. Collected revenue remains the sum of payments marked `Paid`.
- Reminder emails are sent through Resend to the address on the user’s MySQL account. `RESEND_API_KEY` and `EMAIL_FROM` stay in ignored `.env.local`; never commit them.
- The sample sensor documents are historical example readings. Their displayed timestamps indicate when each reading was recorded; they are not a real-time sensor simulation.

## Project structure

```text
app/                 Next.js pages, styles, and API route handlers
lib/                 MySQL, MongoDB, and session helpers
data/                Supplied sensor sample in importable JSON format
scripts/             MongoDB sensor importer and MySQL feature migration
instrumentation.ts   Starts the reservation-reminder scheduler with the Node.js server
.env.example         Local configuration template
```
