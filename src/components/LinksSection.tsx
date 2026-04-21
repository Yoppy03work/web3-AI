import FadeInSection from "./FadeInSection";

export default function LinksSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-24 px-4 w-full flex flex-col items-center border-t border-white/5 relative z-10 mt-16 bg-gradient-to-t from-[#000814] to-transparent">
      <FadeInSection>
        <h2 className="text-2xl font-normal tracking-widest text-white mb-10 text-center font-[family-name:var(--font-inter)]">
          Links
        </h2>
        
        <div className="flex justify-center gap-12 md:gap-16 mb-16">
          <a
            href="https://github.com/Yoppy03work"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#e6e9f2] hover:text-[#7dd3fc] transition-colors duration-300 tracking-wider text-base font-normal flex flex-col items-center gap-3 group"
          >
            <span className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#7dd3fc]/50 transition-colors duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </span>
            GitHub
          </a>
          
          <a
            href="https://x.com/yoppy03_work"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#e6e9f2] hover:text-[#7dd3fc] transition-colors duration-300 tracking-wider text-base font-normal flex flex-col items-center gap-3 group"
          >
            <span className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#7dd3fc]/50 transition-colors duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
                <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
              </svg>
            </span>
            X (Twitter)
          </a>
        </div>

        <p className="text-white/30 text-xs tracking-widest font-light text-center">
          © {currentYear} yoppy — Made for web3/AI概論
        </p>
      </FadeInSection>
    </footer>
  );
}
