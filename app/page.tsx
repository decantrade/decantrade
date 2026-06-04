import { Marquee } from "@/components/Marquee";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Why } from "@/components/Why";
import { Waitlist } from "@/components/Waitlist";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div id="top" className="flex min-h-screen flex-col">
      <Header />
      <Marquee />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <NetworkStatus />
        <Why />
        <Waitlist />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
