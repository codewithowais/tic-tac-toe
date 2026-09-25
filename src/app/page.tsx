import { CreateRoom } from "@/components/CreateRoom";
import { DemoBoard } from "@/components/DemoBoard";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-8 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-10">
        <section className="flex min-w-0 flex-col gap-6 sm:gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-[clamp(2.25rem,6vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-balance">
              Three in a row, with up to four friends.
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-muted text-pretty">
              Make a room, send the link, and play live. Anyone else with the link can watch. No sign-up.
            </p>
          </div>
          <div className="w-full max-w-[200px] sm:max-w-[300px] lg:max-w-[340px]">
            <DemoBoard />
          </div>
        </section>
        <section aria-label="Start a game" className="min-w-0">
          <CreateRoom />
        </section>
      </main>
    </>
  );
}
