"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useEntrance } from "@/lib/motion/use-entrance";

export function PageMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  useEntrance(rootRef, pathname);

  return (
    <div ref={rootRef} className="page-motion" data-route={pathname}>
      {children}
    </div>
  );
}
