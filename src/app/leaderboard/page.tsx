import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard · tic tac toe",
  description: "Who has the most tic-tac-toe wins this week and of all time.",
};

export default function LeaderboardPage() {
  return (
    <>
      <Header />
      <Leaderboard />
    </>
  );
}
