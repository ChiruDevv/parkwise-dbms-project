export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalForScheduler = globalThis as typeof globalThis & {
    __parkwiseReminderScheduler?: NodeJS.Timeout;
  };
  if (globalForScheduler.__parkwiseReminderScheduler) return;

  const { processDueReservationReminders } = await import("./lib/reservation-reminders");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processDueReservationReminders();
    } catch (error) {
      console.error("ParkWise reservation reminder check failed:", error);
    } finally {
      running = false;
    }
  };

  void tick();
  globalForScheduler.__parkwiseReminderScheduler = setInterval(() => void tick(), 60_000);
  globalForScheduler.__parkwiseReminderScheduler.unref?.();
}
