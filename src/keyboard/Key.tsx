import { PropsWithChildren, ReactNode } from "react";
import { shortenHeader } from "./shortenHeader";

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
  const pixelWidth = width * oneU - 2;
  const pixelHeight = height * oneU - 2;

  return (
    <button
      className={`group rounded relative flex justify-center items-center cursor-pointer transition-all hover:shadow-xl hover:ring-1 hover:ring-gray-300 hover:scale-125 ${selected ? "bg-primary text-primary-content" : "bg-base-100 text-base-content"
        }`}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
      }}
      onClick={onClick}
    >
      <div className={`absolute text-xs ${selected ? "text-primary-content" : "z1text-base-content"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>
        {shortenHeader(header)}
        {headerDetail && <> {headerDetail}</>}
      </div>
      {children}
    </button>
  );
};
