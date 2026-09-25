import type { Metadata } from "next";
import { RoomView } from "@/components/room/RoomView";

export async function generateMetadata({ params }: PageProps<"/r/[code]">): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Room ${code.toUpperCase()} · tic tac toe`,
    description: "You're invited to a live game of tic-tac-toe. Open the link to join.",
  };
}

export default async function RoomPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  return <RoomView code={code} />;
}
