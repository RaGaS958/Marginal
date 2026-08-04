import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface AnimatedTabsProps {
  tabs?: Tab[];
  defaultTab?: string;
  className?: string;
}

const defaultTabs: Tab[] = [
  {
    id: "tab1",
    label: "Tab 1",
    content: (
      <div className="grid grid-cols-2 gap-4 w-full h-full">
        <img referrerPolicy="no-referrer" loading="lazy" decoding="async"
          src="https://images.unsplash.com/photo-1493552152660-f915ab47ae9d?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Tab 1"
          className="rounded-lg w-full h-60 object-cover mt-0 !m-0 shadow-lg border-none"
        />
        <div className="flex flex-col gap-y-2">
          <h2 className="text-2xl font-bold mb-0 text-white mt-0 !m-0">
            Tab 1
          </h2>
          <p className="text-sm text-gray-200 mt-0">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam,
            quos.
          </p>
        </div>
      </div>
    ),
  }
];

const AnimatedTabs = ({
  tabs = defaultTabs,
  defaultTab,
  className,
}: AnimatedTabsProps) => {
  const [activeTab, setActiveTab] = useState<string>(defaultTab || tabs[0]?.id);

  if (!tabs?.length) return null;

  return (
    <div className={cn("w-full flex flex-col gap-y-2", className)}>
      <div className="flex gap-2 flex-wrap bg-surface-container-low border border-outline-variant p-1.5 rounded-xl self-start">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative px-4 py-2 text-sm font-medium rounded-lg outline-none transition-colors",
              activeTab === tab.id ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="active-tab"
                className="absolute inset-0 bg-surface-container-high shadow-sm border border-outline-variant !rounded-lg"
                transition={{ type: "spring", duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-6 md:p-8 bg-surface-container-low border border-outline-variant rounded-2xl min-h-[320px] h-full flex flex-col overflow-hidden">
        {tabs.map(
          (tab) =>
            activeTab === tab.id && (
              <motion.div
                key={tab.id}
                initial={{
                  opacity: 0,
                  scale: 0.98,
                  x: -10,
                  filter: "blur(4px)",
                }}
                animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.98, x: -10, filter: "blur(4px)" }}
                transition={{
                  duration: 0.4,
                  ease: "circInOut",
                  type: "spring",
                }}
                className="flex-1 flex"
              >
                {tab.content}
              </motion.div>
            )
        )}
      </div>
    </div>
  );
};

export default AnimatedTabs;
