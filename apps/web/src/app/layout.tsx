import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Women’s Health Journal Companion AI",
  description: "Private, supportive wellness journaling and trend awareness."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
