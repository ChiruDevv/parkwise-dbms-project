import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParkWise | Smart parking, made simple",
  description: "Find an open space, manage reservations, and monitor parking lot sensors with ParkWise.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
