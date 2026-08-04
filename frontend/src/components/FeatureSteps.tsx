import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"

interface Feature {
  step: string
  title?: string
  content: string
  image: string
}

interface FeatureStepsProps {
  features: Feature[]
  className?: string
  title?: string
  autoPlayInterval?: number
  imageAspectRatio?: string
}

export function FeatureSteps({
  features,
  className = "",
  title = "How to get Started",
  autoPlayInterval = 3000,
  imageAspectRatio = "aspect-video md:aspect-square lg:aspect-[4/3]",
}: FeatureStepsProps) {
  const [currentFeature, setCurrentFeature] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (isHovering) return

    const timer = setInterval(() => {
      if (progress < 100) {
        setProgress((prev) => prev + 100 / (autoPlayInterval / 100))
      } else {
        setCurrentFeature((prev) => (prev + 1) % features.length)
        setProgress(0)
      }
    }, 100)

    return () => clearInterval(timer)
  }, [progress, features.length, autoPlayInterval, isHovering])

  const handleFeatureClick = (index: number) => {
    setCurrentFeature(index)
    setProgress(0)
  }

  return (
    <div className={`p-8 md:p-12 ${className}`}>
      <div className="max-w-[1280px] mx-auto w-full">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-display-lg font-semibold mb-12 text-center text-on-surface">
          {title}
        </h2>

        <div className="flex flex-col md:grid md:grid-cols-2 gap-8 md:gap-16">
          <div 
            className="order-2 md:order-1 space-y-8"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="flex items-start gap-6 md:gap-8 cursor-pointer group"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: index === currentFeature ? 1 : 0.4 }}
                transition={{ duration: 0.5 }}
                onClick={() => handleFeatureClick(index)}
              >
                <motion.div
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-colors duration-300 ${
                    index === currentFeature
                      ? "bg-primary-container border-primary-container text-on-primary-container scale-110"
                      : "bg-surface-container-high border-outline-variant text-on-surface-variant group-hover:border-outline"
                  }`}
                >
                  {index <= currentFeature ? (
                    <span className="text-xl font-bold font-label-mono">✓</span>
                  ) : (
                    <span className="text-xl font-semibold font-label-mono">{index + 1}</span>
                  )}
                </motion.div>

                <div className="flex-1 pt-1">
                  <h3 className="text-xl md:text-2xl font-semibold font-body-md text-on-surface mb-2">
                    {feature.title || feature.step}
                  </h3>
                  <p className="text-sm md:text-base text-on-surface-variant leading-relaxed">
                    {feature.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div
            className={`order-1 md:order-2 relative w-full ${imageAspectRatio} overflow-hidden rounded-2xl border border-outline-variant shadow-sm bg-surface-container-low`}
          >
            <AnimatePresence mode="wait">
              {features.map(
                (feature, index) =>
                  index === currentFeature && (
                    <motion.div
                      key={index}
                      className="absolute inset-0 overflow-hidden"
                      initial={{ y: 100, opacity: 0, rotateX: -20 }}
                      animate={{ y: 0, opacity: 1, rotateX: 0 }}
                      exit={{ y: -100, opacity: 0, rotateX: 20 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    >
                      <img
                        src={feature.image}
                        alt={feature.step}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform transform"
                        loading="lazy"
                        decoding="async"
                      />
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
