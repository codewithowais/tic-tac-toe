import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Admin · tic tac toe",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <Header />
      <AdminApp />
    </>
  );
}
