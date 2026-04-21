import FadeInSection from "./FadeInSection";

export default function AboutSection() {
  return (
    <section className="py-24 px-4 max-w-3xl mx-auto w-full">
      <FadeInSection>
        <div className="p-8 md:p-12 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md relative overflow-hidden">
          {/* 装飾的な薄い光 */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#7dd3fc] opacity-[0.03] blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

          <h2 className="text-4xl font-normal tracking-widest text-white mb-12 pb-6 border-b border-white/10 font-[family-name:var(--font-inter)]">
            About Me
          </h2>

          <div className="space-y-12">
            <div>
              <h3 className="text-[#7dd3fc] text-base tracking-widest uppercase mb-4 font-semibold">関心領域</h3>
              <p className="text-[#e6e9f2] leading-relaxed text-xl font-normal">
                セキュリティー、AIを用いたプロダクト開発
              </p>
            </div>

            <div>
              <h3 className="text-[#7dd3fc] text-base tracking-widest uppercase mb-4 font-semibold">普段していること</h3>
              <p className="text-[#e6e9f2] leading-relaxed text-xl font-normal">
                TryHackMe と HackTheBox に取り組みながら、本を読んで知識を深めています。
              </p>
            </div>
          </div>
        </div>
      </FadeInSection>
    </section>
  );
}
