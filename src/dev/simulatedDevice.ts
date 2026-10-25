// A fake ZMK Studio device for debugging the UI without a keyboard attached.
// Only offered when running the Vite dev server (see App.tsx).
//
// It speaks the real RPC protocol (framed protobuf messages) over in-memory
// streams, so the rest of the app can't tell it apart from a real keyboard.

import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import type { RequestResponse } from "@zmkfirmware/zmk-studio-ts-client";
import { get_decoder, get_encoder } from "@zmkfirmware/zmk-studio-ts-client/framing";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type {
  BehaviorParameterValueDescription,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type {
  BehaviorBinding,
  KeyPhysicalAttrs,
  Keymap,
  Layer,
  PhysicalLayout,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ErrorConditions } from "@zmkfirmware/zmk-studio-ts-client/meta";

const DEVICE_NAME = "Corne (simulated)";
const MAX_LAYERS = 6;
const MAX_LAYER_NAME_LENGTH = 20;
// How long after locking the device "unlocks" itself, as if the unlock key was pressed
const AUTO_UNLOCK_MS = 3000;

// ---------- Physical layout: Corne, 3x6 + 3 thumb keys per side ----------

// Physical attributes are in hundredths of a key unit, rotation in hundredths of a degree
const key = (
  x: number,
  y: number,
  extra: Partial<KeyPhysicalAttrs> = {}
): KeyPhysicalAttrs => ({
  width: 100,
  height: 100,
  x,
  y,
  r: 0,
  rx: 0,
  ry: 0,
  ...extra,
});

function corneLayout(): PhysicalLayout {
  const leftStagger = [37, 37, 12, 0, 12, 25];
  const rightStagger = [...leftStagger].reverse();
  const rightStart = 900;

  const keys: KeyPhysicalAttrs[] = [];
  for (let row = 0; row < 3; row++) {
    leftStagger.forEach((s, col) => keys.push(key(col * 100, row * 100 + s)));
    rightStagger.forEach((s, col) =>
      keys.push(key(rightStart + col * 100, row * 100 + s))
    );
  }

  // Thumbs: two regular keys plus a tall, rotated inner key on each side
  keys.push(key(350, 337), key(450, 337));
  keys.push(key(560, 312, { height: 150, r: 3000, rx: 560, ry: 312 }));
  keys.push(key(740, 312, { height: 150, r: -3000, rx: 840, ry: 312 }));
  keys.push(key(850, 337), key(950, 337));

  return { name: "Corne", keys };
}

// ---------- Behaviors ----------

const hidUsage: BehaviorParameterValueDescription = {
  name: "Key",
  hidUsage: { keyboardMax: 0xff, consumerMax: 0xfff },
};
const layerId: BehaviorParameterValueDescription = {
  name: "Layer",
  layerId: {},
};
const constant = (name: string, value: number) => ({ name, constant: value });

const B = {
  KEY_PRESS: 1,
  MO: 2,
  LT: 3,
  MT: 4,
  TG: 5,
  TO: 6,
  TRANS: 7,
  NONE: 8,
  BT: 9,
  STICKY_KEY: 10,
  BOOTLOADER: 11,
  RESET: 12,
  STUDIO_UNLOCK: 13,
};

const BEHAVIORS: GetBehaviorDetailsResponse[] = [
  { id: B.KEY_PRESS, displayName: "Key Press", metadata: [{ param1: [hidUsage], param2: [] }] },
  { id: B.MO, displayName: "Momentary Layer", metadata: [{ param1: [layerId], param2: [] }] },
  { id: B.LT, displayName: "Layer-Tap", metadata: [{ param1: [layerId], param2: [hidUsage] }] },
  { id: B.MT, displayName: "Mod-Tap", metadata: [{ param1: [hidUsage], param2: [hidUsage] }] },
  { id: B.TG, displayName: "Toggle Layer", metadata: [{ param1: [layerId], param2: [] }] },
  { id: B.TO, displayName: "To Layer", metadata: [{ param1: [layerId], param2: [] }] },
  { id: B.TRANS, displayName: "Transparent", metadata: [] },
  { id: B.NONE, displayName: "None", metadata: [] },
  {
    id: B.BT,
    displayName: "Bluetooth",
    metadata: [
      {
        param1: [
          constant("Clear Profile", 0),
          constant("Next Profile", 1),
          constant("Previous Profile", 2),
          constant("Clear All Profiles", 5),
        ],
        param2: [],
      },
      {
        param1: [constant("Select Profile", 3), constant("Disconnect Profile", 6)],
        param2: [{ name: "Profile", range: { min: 0, max: 4 } }],
      },
    ],
  },
  { id: B.STICKY_KEY, displayName: "Sticky Key", metadata: [{ param1: [hidUsage], param2: [] }] },
  { id: B.BOOTLOADER, displayName: "Bootloader", metadata: [] },
  { id: B.RESET, displayName: "Reset", metadata: [] },
  { id: B.STUDIO_UNLOCK, displayName: "Studio Unlock", metadata: [] },
];

// ---------- Default keymap ----------

// HID keyboard usages (page 7)
const K: Record<string, number> = {
  ENTER: 0x28, ESC: 0x29, BSPC: 0x2a, TAB: 0x2b, SPACE: 0x2c, MINUS: 0x2d,
  EQUAL: 0x2e, LBKT: 0x2f, RBKT: 0x30, BSLH: 0x31, SEMI: 0x33, SQT: 0x34,
  GRAVE: 0x35, COMMA: 0x36, DOT: 0x37, FSLH: 0x38, RIGHT: 0x4f, LEFT: 0x50,
  DOWN: 0x51, UP: 0x52, LCTRL: 0xe0, LSHFT: 0xe1, LALT: 0xe2, LGUI: 0xe3,
  RCTRL: 0xe4, RSHFT: 0xe5, RALT: 0xe6,
};
for (let i = 0; i < 26; i++) K[String.fromCharCode(65 + i)] = 0x04 + i;
for (let i = 1; i <= 9; i++) K[`N${i}`] = 0x1d + i;
K.N0 = 0x27;
for (let i = 1; i <= 12; i++) K[`F${i}`] = 0x39 + i;

const usage = (name: string) => (7 << 16) | K[name];
const bind = (behaviorId: number, param1 = 0, param2 = 0): BehaviorBinding => ({
  behaviorId,
  param1,
  param2,
});
const kp = (name: string) => bind(B.KEY_PRESS, usage(name));
const mt = (mod: string, tap: string) => bind(B.MT, usage(mod), usage(tap));
const lt = (layer: number, tap: string) => bind(B.LT, layer, usage(tap));
const mo = (layer: number) => bind(B.MO, layer);
const bt = (cmd: number, profile = 0) => bind(B.BT, cmd, profile);
const trans = bind(B.TRANS);
const none = bind(B.NONE);

function defaultLayers(): Layer[] {
  return [
    {
      id: 0,
      name: "Base",
      bindings: [
        kp("TAB"), kp("Q"), kp("W"), kp("E"), kp("R"), kp("T"),
        kp("Y"), kp("U"), kp("I"), kp("O"), kp("P"), kp("BSPC"),
        kp("LCTRL"), mt("LSHFT", "A"), kp("S"), kp("D"), kp("F"), kp("G"),
        kp("H"), kp("J"), kp("K"), kp("L"), mt("RSHFT", "SEMI"), kp("SQT"),
        kp("LSHFT"), kp("Z"), kp("X"), kp("C"), kp("V"), kp("B"),
        kp("N"), kp("M"), kp("COMMA"), kp("DOT"), kp("FSLH"), kp("ESC"),
        kp("LGUI"), mo(1), kp("SPACE"),
        lt(2, "ENTER"), mo(2), mt("RALT", "ESC"),
      ],
    },
    {
      id: 1,
      name: "Lower",
      bindings: [
        kp("TAB"), kp("N1"), kp("N2"), kp("N3"), kp("N4"), kp("N5"),
        kp("N6"), kp("N7"), kp("N8"), kp("N9"), kp("N0"), kp("BSPC"),
        kp("LCTRL"), bt(0), bt(3, 0), bt(3, 1), bt(3, 2), bt(3, 3),
        kp("LEFT"), kp("DOWN"), kp("UP"), kp("RIGHT"), none, none,
        kp("LSHFT"), none, none, none, none, none,
        none, none, none, none, none, none,
        trans, trans, trans,
        trans, bind(B.TG, 3), trans,
      ],
    },
    {
      id: 2,
      name: "Raise",
      bindings: [
        kp("TAB"), kp("F1"), kp("F2"), kp("F3"), kp("F4"), kp("F5"),
        kp("MINUS"), kp("EQUAL"), kp("LBKT"), kp("RBKT"), kp("BSLH"), kp("GRAVE"),
        kp("LCTRL"), kp("F6"), kp("F7"), kp("F8"), kp("F9"), kp("F10"),
        none, none, none, none, none, none,
        kp("LSHFT"), kp("F11"), kp("F12"), none, none, none,
        none, none, none, none, none, bind(B.BOOTLOADER),
        trans, mo(3), trans,
        trans, trans, trans,
      ],
    },
    {
      id: 3,
      name: "Adjust",
      bindings: [
        bind(B.STUDIO_UNLOCK), bt(1), bt(2), bt(5), bt(6, 0), none,
        none, none, none, none, none, bind(B.RESET),
        bind(B.STICKY_KEY, usage("LSHFT")), none, none, none, none, none,
        none, none, none, none, none, none,
        none, none, none, none, none, none,
        none, none, none, none, none, bind(B.BOOTLOADER),
        trans, trans, trans,
        trans, trans, bind(B.TO, 0),
      ],
    },
  ];
}

// ---------- Device state ----------

const clone = <T>(v: T): T => structuredClone(v);

class SimulatedDevice {
  private savedLayers = defaultLayers();
  private layers = clone(this.savedLayers);
  // Removed layers, kept so "undo" (restore layer) can bring them back
  private removedLayers = new Map<number, Layer>();
  private nextLayerId = 100;
  private lockState = LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
  private readonly layout = corneLayout();

  constructor(private notify: (r: Response) => void) {}

  private keymap(): Keymap {
    return {
      layers: clone(this.layers),
      availableLayers: MAX_LAYERS - this.layers.length,
      maxLayerNameLength: MAX_LAYER_NAME_LENGTH,
    };
  }

  // Tell the app whether there are unsaved changes, right after the
  // response to the current request has been sent
  private changed() {
    const unsaved =
      JSON.stringify(this.layers) !== JSON.stringify(this.savedLayers);
    queueMicrotask(() =>
      this.notify({
        notification: { keymap: { unsavedChangesStatusChanged: unsaved } },
      })
    );
  }

  private setLockState(state: LockState) {
    this.lockState = state;
    this.notify({ notification: { core: { lockStateChanged: state } } });
  }

  handle(req: Request): Omit<RequestResponse, "requestId"> {
    const { core, behaviors, keymap } = req;

    if (core) {
      if (core.getDeviceInfo) {
        return {
          core: {
            getDeviceInfo: {
              name: DEVICE_NAME,
              serialNumber: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
            },
          },
        };
      }
      if (core.getLockState) {
        return { core: { getLockState: this.lockState } };
      }
      if (core.lock) {
        setTimeout(
          () => this.setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED),
          0
        );
        setTimeout(
          () => this.setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED),
          AUTO_UNLOCK_MS
        );
        return { core: {} };
      }
      if (core.resetSettings) {
        this.savedLayers = defaultLayers();
        this.layers = clone(this.savedLayers);
        this.changed();
        return { core: { resetSettings: true } };
      }
    }

    // Like a real device, everything except core requests needs it unlocked
    if (this.lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
      return { meta: { simpleError: ErrorConditions.UNLOCK_REQUIRED } };
    }

    if (behaviors) {
      if (behaviors.listAllBehaviors) {
        return {
          behaviors: {
            listAllBehaviors: { behaviors: BEHAVIORS.map((b) => b.id) },
          },
        };
      }
      if (behaviors.getBehaviorDetails) {
        const id = behaviors.getBehaviorDetails.behaviorId;
        const details = BEHAVIORS.find((b) => b.id === id);
        return details
          ? { behaviors: { getBehaviorDetails: clone(details) } }
          : { meta: { simpleError: ErrorConditions.GENERIC } };
      }
    }

    if (keymap) {
      return { keymap: this.handleKeymap(keymap) };
    }

    return { meta: { simpleError: ErrorConditions.RPC_NOT_FOUND } };
  }

  private handleKeymap(
    req: NonNullable<Request["keymap"]>
  ): NonNullable<RequestResponse["keymap"]> {
    if (req.getKeymap) {
      return { getKeymap: this.keymap() };
    }
    if (req.getPhysicalLayouts) {
      return {
        getPhysicalLayouts: {
          activeLayoutIndex: 0,
          layouts: [clone(this.layout)],
        },
      };
    }
    if (req.setActivePhysicalLayout !== undefined) {
      return req.setActivePhysicalLayout === 0
        ? { setActivePhysicalLayout: { ok: this.keymap() } }
        : { setActivePhysicalLayout: { err: 2 } };
    }
    if (req.setLayerBinding) {
      const { layerId, keyPosition, binding } = req.setLayerBinding;
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer || keyPosition < 0 || keyPosition >= layer.bindings.length) {
        return { setLayerBinding: 1 };
      }
      if (!binding || !BEHAVIORS.some((b) => b.id === binding.behaviorId)) {
        return { setLayerBinding: 2 };
      }
      layer.bindings[keyPosition] = clone(binding);
      this.changed();
      return { setLayerBinding: 0 };
    }
    if (req.checkUnsavedChanges) {
      return {
        checkUnsavedChanges:
          JSON.stringify(this.layers) !== JSON.stringify(this.savedLayers),
      };
    }
    if (req.saveChanges) {
      this.savedLayers = clone(this.layers);
      this.changed();
      return { saveChanges: { ok: true } };
    }
    if (req.discardChanges) {
      this.layers = clone(this.savedLayers);
      this.changed();
      return { discardChanges: true };
    }
    if (req.moveLayer) {
      const { startIndex, destIndex } = req.moveLayer;
      const n = this.layers.length;
      if (startIndex < 0 || startIndex >= n) return { moveLayer: { err: 2 } };
      if (destIndex < 0 || destIndex >= n) return { moveLayer: { err: 3 } };
      const [layer] = this.layers.splice(startIndex, 1);
      this.layers.splice(destIndex, 0, layer);
      this.changed();
      return { moveLayer: { ok: this.keymap() } };
    }
    if (req.addLayer) {
      if (this.layers.length >= MAX_LAYERS) return { addLayer: { err: 2 } };
      const layer: Layer = {
        id: this.nextLayerId++,
        name: "",
        bindings: this.layout.keys.map(() => clone(trans)),
      };
      this.layers.push(layer);
      this.changed();
      return {
        addLayer: { ok: { index: this.layers.length - 1, layer: clone(layer) } },
      };
    }
    if (req.removeLayer) {
      const { layerIndex } = req.removeLayer;
      if (layerIndex < 0 || layerIndex >= this.layers.length) {
        return { removeLayer: { err: 2 } };
      }
      const [layer] = this.layers.splice(layerIndex, 1);
      this.removedLayers.set(layer.id, layer);
      this.changed();
      return { removeLayer: { ok: {} } };
    }
    if (req.restoreLayer) {
      const { layerId, atIndex } = req.restoreLayer;
      const layer = this.removedLayers.get(layerId);
      if (!layer) return { restoreLayer: { err: 2 } };
      if (atIndex < 0 || atIndex > this.layers.length) {
        return { restoreLayer: { err: 3 } };
      }
      this.removedLayers.delete(layerId);
      this.layers.splice(atIndex, 0, layer);
      this.changed();
      return { restoreLayer: { ok: clone(layer) } };
    }
    if (req.setLayerProps) {
      const { layerId, name } = req.setLayerProps;
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return { setLayerProps: 2 };
      layer.name = name.substring(0, MAX_LAYER_NAME_LENGTH);
      this.changed();
      return { setLayerProps: 0 };
    }
    return {};
  }
}

// ---------- Transport ----------

export async function connect(): Promise<RpcTransport> {
  const abortController = new AbortController();

  // Device -> app: responses are protobuf encoded, then framed
  const outgoing = new TransformStream<Uint8Array, Uint8Array>(get_encoder());
  const outWriter = outgoing.writable.getWriter();
  const send = (r: Response) => {
    if (!abortController.signal.aborted) {
      outWriter.write(Response.encode(r).finish()).catch(() => {});
    }
  };

  // App -> device: frames are decoded, then parsed as requests
  const incoming = new TransformStream<Uint8Array, Uint8Array>(get_decoder());

  const device = new SimulatedDevice(send);

  (async () => {
    const reader = incoming.readable.getReader();
    abortController.signal.addEventListener("abort", () => {
      reader.cancel().catch(() => {});
      outWriter.close().catch(() => {});
    });

    while (!abortController.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      const req = Request.decode(value);
      console.debug("[simulated device] request", req);
      send({ requestResponse: { requestId: req.requestId, ...device.handle(req) } });
    }
  })().catch((e) => console.error("[simulated device]", e));

  return {
    label: "Simulated",
    abortController,
    readable: outgoing.readable,
    writable: incoming.writable,
  };
}
