import FadeInSection from "./FadeInSection";

const philosophies = [
  {
    title: "自分にとってAIとは何か",
    description: "仕事を行う上での相棒。知識はあるが、使いこなすには人間にドメインと技術の知識が必要。",
    delay: 0,
  },
  {
    title: "AIとどう向き合いたいか",
    description: "うまく使いこなし、使われる側ではなく使う側でいたい。あくまでサポーター。",
    delay: 0.1,
  },
  {
    title: "何を作りたい／探究したいか",
    description: "セキュリティー（インシデント）の個別具体化した対策を一緒に考え、教えてくれるAIアプリ。",
    delay: 0.2,
  },
];

export default function AIPhilosophy() {
  return (
    <section className="py-24 px-4 max-w-6xl mx-auto w-full">
      <FadeInSection>
        <h2 className="text-4xl font-normal tracking-widest text-center text-white mb-20 font-[family-name:var(--font-inter)]">
          AI <span className="text-white/30 mx-2">×</span> Me
        </h2>
      </FadeInSection>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {philosophies.map((item, index) => (
          <FadeInSection key={index} delay={item.delay}>
            <div className="h-full p-10 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/10 transition-colors duration-500 flex flex-col group">
              <h3 className="text-[#7dd3fc] text-base tracking-wider leading-relaxed mb-8 border-b border-white/10 pb-4 font-semibold">
                {item.title}
              </h3>
              <p className="text-[#e6e9f2] font-normal leading-loose text-lg flex-grow">
                {item.description}
              </p>
              
              {/* 装飾: ホバー時にうっすら光る */}
              <div className="w-full h-[1px] mt-6 bg-gradient-to-r from-transparent via-[#7dd3fc]/0 to-transparent group-hover:via-[#7dd3fc]/30 transition-all duration-700"></div>
            </div>
          </FadeInSection>
        ))}
      </div>
    </section>
  );
}
