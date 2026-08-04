import { ReactLenis } from 'lenis/react';
import { useTransform, motion, useScroll, MotionValue } from 'motion/react';
import { useRef, forwardRef } from 'react';

interface ProjectData {
  title: string;
  description: string;
  link: string;
  color: string;
}

interface CardProps {
  i: number;
  title: string;
  description: string;
  url: string;
  color: string;
  progress: MotionValue<number>;
  range: [number, number];
  targetScale: number;
  key?: string | number;
}

export const Card = ({
  i,
  title,
  description,
  url,
  color,
  progress,
  range,
  targetScale,
}: CardProps) => {
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start end', 'start start'],
  });

  const imageScale = useTransform(scrollYProgress, [0, 1], [2, 1]);
  const scale = useTransform(progress, range, [1, targetScale]);

  return (
    <div
      ref={container}
      className="h-screen flex items-center justify-center sticky top-0"
    >
      <motion.div
        style={{
          backgroundColor: color,
          scale,
          top: `calc(-5vh + ${i * 25}px)`,
        }}
        className="flex flex-col md:flex-row relative -top-[10%] h-auto md:h-[450px] w-full max-w-4xl rounded-2xl p-6 md:p-10 origin-top shadow-sm border border-outline-variant"
      >
        <div className="flex flex-col h-full gap-6 w-full md:w-[40%] mr-0 md:mr-10 z-10 pt-4">
          <h2 className="text-2xl font-headline-md text-on-surface">{title}</h2>
          <p className="text-base text-on-surface-variant font-body-md leading-relaxed">{description}</p>
        </div>
        <div className="relative w-full md:w-[60%] h-[200px] md:h-full rounded-xl overflow-hidden shadow-sm border border-outline-variant/50 mt-6 md:mt-0">
          <motion.div className="w-full h-full" style={{ scale: imageScale }}>
            <img referrerPolicy="no-referrer" loading="lazy" decoding="async"
              src={url}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90"
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

interface ComponentRootProps {
  projects: ProjectData[];
}

const StackingCards = forwardRef<HTMLElement, ComponentRootProps>(({ projects }, ref) => {
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end'],
  });

  return (
    <ReactLenis root>
      <div className="w-full relative" ref={container}>
        <div className="w-full relative mt-10">
          {projects.map((project, i) => {
            const targetScale = 1 - (projects.length - i) * 0.05;
            return (
              <Card
                key={`p_${i}`}
                i={i}
                url={project.link}
                title={project.title}
                color={project.color}
                description={project.description}
                progress={scrollYProgress}
                range={[i * 0.25, 1]}
                targetScale={targetScale}
              />
            );
          })}
        </div>
      </div>
    </ReactLenis>
  );
});

StackingCards.displayName = 'StackingCards';

export default StackingCards;
