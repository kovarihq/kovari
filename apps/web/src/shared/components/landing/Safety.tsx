import { motion } from "framer-motion";

export default function Safety() {
  return (
    <section id="safety" className="relative py-14 md:py-24 lg:py-32 overflow-hidden text-center">


      <div className="container mx-auto px-6 md:px-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto space-y-8"
        >
          {/* Eyebrow label */}
          <span className="text-[10px] tracking-[0.25em] text-muted-foreground/80 uppercase mb-3 font-mono inline-block">
            SAFETY & TRUST
          </span>

          {/* Main Contract Statement */}
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight mb-12 max-w-3xl mx-auto leading-tight">
            Built for real travelers. Not random strangers.
          </h2>

          <p className="text-sm md:text-base text-muted-foreground font-light max-w-lg mx-auto leading-relaxed mb-12 text-center">
            Report any user instantly. Block with one tap. Every flag is reviewed by our team.
          </p>

          {/* Pills row */}
          <div className="flex flex-row gap-2 justify-center select-none items-center">
            <span className="px-4 py-1.5 rounded-full text-foreground text-xs sm:text-sm">
              Block Instantly
            </span>
            <span className="text-foreground bg-muted rounded-full w-1.5 h-1.5"></span>
            <span className="px-4 py-1.5 rounded-full  text-foreground text-xs sm:text-sm">
              Reports Reviewed
            </span>
             <span className="text-foreground bg-muted rounded-full w-1.5 h-1.5"></span>
            <span className="px-4 py-1.5 rounded-full  text-foreground text-xs sm:text-sm">
              Community Moderated
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

