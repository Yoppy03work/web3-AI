"use client";

import { motion } from "framer-motion";
import FadeInSection from "./FadeInSection";

export default function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <FadeInSection>
        <h1 className="text-6xl md:text-8xl font-bold tracking-widest text-[#f8fafc] mb-6 font-[family-name:var(--font-inter)]">
          yoppy
        </h1>
      </FadeInSection>

      <FadeInSection delay={0.2}>
        <div className="space-y-4 mb-10 text-[#e6e9f2] text-base md:text-lg tracking-wide font-normal">
          <p>千葉工業大学 情報変革科学部</p>
          <p>セキュリティーに興味がある</p>
        </div>
      </FadeInSection>

      <FadeInSection delay={0.4}>
        <div className="px-8 py-4 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm shadow-[0_0_20px_rgba(125,211,252,0.1)]">
          <p className="text-[#7dd3fc] font-semibold tracking-wider text-lg md:text-xl">
            AIと一緒に学び、作り、壊す人
          </p>
        </div>
      </FadeInSection>

      <motion.div
        className="absolute bottom-12 flex flex-col items-center text-white/40 text-xs tracking-widest gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
      >
        <span>SCROLL</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-[1px] h-8 bg-gradient-to-b from-white/40 to-transparent"
        />
      </motion.div>
    </section>
  );
}
