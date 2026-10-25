import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  BehaviorParameterValueDescription,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { ReactNode } from "react";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import { FitText } from "./FitText";
import { shortenHeader } from "./shortenHeader";
import { validateValue } from "../behaviors/parameters";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

type Layer = { id: number; name: string };

// Label for one binding parameter, based on what the behavior metadata says it is.
function paramLabel(
  layers: Layer[],
  value: number,
  descriptions: BehaviorParameterValueDescription[] | undefined
): ReactNode {
  const layerIds = layers.map((l) => l.id);
  const desc = descriptions?.find((d) => validateValue(layerIds, value, [d]));

  if (!desc || desc.nil) {
    return null;
  } else if (desc.constant !== undefined) {
    return desc.name;
  } else if (desc.range) {
    return value.toString();
  } else if (desc.hidUsage) {
    return <HidUsageLabel hid_usage={value} />;
  } else if (desc.layerId) {
    const index = layers.findIndex((l) => l.id === value);
    return layers[index]?.name || index.toString();
  }
  return null;
}

// Inset box around the main parameter, like QMK Configurator's MO(1) / LT keys.
const ParamBox = ({ children }: { children: ReactNode }) => (
  <FitText className="mt-1 px-1 min-w-[1.6em] max-w-[85%] text-center rounded-sm border border-current leading-tight">
    {children}
  </FitText>
);

function bindingLabels(
  binding: BehaviorBinding,
  behavior: GetBehaviorDetailsResponse | undefined,
  layers: Layer[]
): { headerDetail?: ReactNode; children: ReactNode } {
  if (!behavior) {
    return { children: <HidUsageLabel hid_usage={binding.param1} /> };
  }

  const layerIds = layers.map((l) => l.id);
  const set =
    behavior.metadata.find((s) =>
      validateValue(layerIds, binding.param1, s.param1)
    ) ?? behavior.metadata[0];

  const labels = [
    paramLabel(layers, binding.param1, set?.param1),
    paramLabel(layers, binding.param2, set?.param2),
  ].filter((l) => l !== null);

  if (labels.length === 0) {
    return { children: null };
  }

  // Behaviors without a header (plain key press) show their label as-is
  if (shortenHeader(behavior.displayName) === "") {
    return {
      children: (
        <FitText className="max-w-full px-[2px] text-center">{labels[0]}</FitText>
      ),
    };
  }

  if (labels.length === 1) {
    return { children: <ParamBox>{labels[0]}</ParamBox> };
  }

  // Two params (e.g. layer-tap, mod-tap): hold part next to the header, tap part in the box
  return {
    headerDetail: labels[0],
    children: <ParamBox>{labels[1]}</ParamBox>,
  };
}

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const behavior = behaviors[binding.behaviorId];
    const { headerDetail, children } = bindingLabels(
      binding,
      behavior,
      keymap.layers
    );

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header: behavior?.displayName || "Unknown",
      headerDetail,
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children,
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
