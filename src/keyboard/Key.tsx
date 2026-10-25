import { PropsWithChildren, ReactNode } from "react";
import { shortenHeader } from "./shortenHeader";
import { FitText } from "./FitText";

interface KeyProps {
  selected?: boolean;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  // Extra detail shown after the header, e.g. the hold layer of a layer-tap
  headerDetail?: ReactNode;
  onClick?: () => void;
}

export const Key = ({
  selected = false,
  width,
  height,
  oneU,
  header,
  headerDetail,
  onClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  // Leave a small gap between neighbouring keys
  const pixelWidth = width * oneU - 4;
  const pixelHeight = height * oneU - 4;

  // Keycap look like QMK Configurator: a darker "side" with a lighter top
  // surface that sits a bit toward the top, as if seen slightly from above.
  const sideColor = selected
    ? "bg-[color-mix(in_srgb,theme(colors.primary),black_30%)]"
    : "bg-[color-mix(in_srgb,theme(colors.base-100),black_22%)]";
  const topColor = selected
    ? "bg-primary text-primary-content"
    : "bg-base-100 text-base-content";

  return (
    <button
      className={`group relative flex rounded-md px-[3px] pt-[2px] pb-[6px] cursor-pointer transition-all shadow-[0_2px_3px_rgba(0,0,0,0.35)] hover:shadow-xl hover:ring-1 hover:ring-gray-300 hover:scale-125 ${sideColor}`}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
      }}
      onClick={onClick}
    >
      <div
        className={`relative flex flex-1 flex-col justify-center items-center rounded bg-gradient-to-b from-white/10 to-black/5 ${topColor}`}
      >
        <div className="absolute inset-x-[2px] top-[2px] flex justify-center text-xs opacity-80 font-light">
          <FitText className="max-w-full">
            {shortenHeader(header)}
            {headerDetail && <> {headerDetail}</>}
          </FitText>
        </div>
        {children}
      </div>
    </button>
  );
};
