import StarryBackground from "@/components/StarryBackground";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import AIPhilosophy from "@/components/AIPhilosophy";
import LinksSection from "@/components/LinksSection";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* 画面背面に完全に固定される星空背景 */}
      <StarryBackground />
      
      {/* メインコンテンツ */}
      <div className="relative z-10 flex flex-col items-center">
        <HeroSection />
        <AboutSection />
        <AIPhilosophy />
        <LinksSection />
      </div>
    </main>
  );
}
