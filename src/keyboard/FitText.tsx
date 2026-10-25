import { PropsWithChildren, useLayoutEffect, useRef } from "react";

interface FitTextProps {
  className?: string;
  // Smallest font size in pixels; text that still doesn't fit is clipped
  minFontSize?: number;
}

// Shrinks its font size until the text fits on one line, instead of cutting it off.
// The width limit comes from `className` (e.g. max-w-full).
export const FitText = ({
  className = "",
  minFontSize = 7,
  children,
}: PropsWithChildren<FitTextProps>) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      el.style.fontSize = "";
      const { scrollWidth, clientWidth } = el;
      if (scrollWidth > clientWidth && clientWidth > 0) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        // Round down a little, since text width doesn't scale exactly with font size
        const fitted = Math.floor(((size * clientWidth) / scrollWidth) * 10) / 10;
        el.style.fontSize = `${Math.max(minFontSize, fitted)}px`;
      }
    };

    fit();
    // Labels can change with the key's size (container queries pick longer or
    // shorter names), so refit when the key or the text itself resizes
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  });

  return (
    <span
      ref={ref}
      className={`overflow-hidden whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
};
