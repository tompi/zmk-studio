import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  BehaviorBinding,
  Keymap,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import {
  SetLayerBindingResponse,
  SetLayerPropsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { call_rpc } from "../rpc/logging";
import {
  BehaviorMap,
  isImportError,
  ParsedKeymapFile,
  qmkToBinding,
} from "./qmkJson";

export interface ImportResult {
  keymap: Keymap;
  changedKeys: number;
  warnings: string[];
  undo: () => Promise<Keymap | undefined>;
}

const sameBinding = (a: BehaviorBinding, b: BehaviorBinding) =>
  a.behaviorId === b.behaviorId && a.param1 === b.param1 && a.param2 === b.param2;

async function getKeymap(conn: RpcConnection) {
  const resp = await call_rpc(conn, { keymap: { getKeymap: true } });
  const keymap = resp.keymap?.getKeymap;
  if (!keymap) throw new Error("Couldn't read the keymap from the keyboard");
  return keymap;
}

async function setBinding(
  conn: RpcConnection,
  layerId: number,
  keyPosition: number,
  binding: BehaviorBinding
) {
  const resp = await call_rpc(conn, {
    keymap: { setLayerBinding: { layerId, keyPosition, binding } },
  });
  return (
    resp.keymap?.setLayerBinding ===
    SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
  );
}

async function setLayerName(conn: RpcConnection, layerId: number, name: string) {
  const resp = await call_rpc(conn, {
    keymap: { setLayerProps: { layerId, name } },
  });
  return (
    resp.keymap?.setLayerProps == SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
  );
}

// Write an imported keymap to the keyboard. The changes are left unsaved, like any edit.
export async function applyImport(
  conn: RpcConnection,
  file: ParsedKeymapFile,
  behaviors: BehaviorMap
): Promise<ImportResult> {
  const warnings: string[] = [];
  const before = await getKeymap(conn);

  // Add layers if the file has more than the keyboard
  const addedLayerIds: number[] = [];
  const missing = file.layers.length - before.layers.length;
  const canAdd = Math.min(missing, before.availableLayers);
  for (let i = 0; i < canAdd; i++) {
    const resp = await call_rpc(conn, { keymap: { addLayer: {} } });
    const layer = resp.keymap?.addLayer?.ok?.layer;
    if (!layer) break;
    addedLayerIds.push(layer.id);
  }
  const keymap = addedLayerIds.length ? await getKeymap(conn) : before;
  if (file.layers.length > keymap.layers.length) {
    warnings.push(
      `The file has ${file.layers.length} layers, but this keyboard only has room for ${keymap.layers.length}. The extra layers were skipped.`
    );
  }

  const noneId = Object.values(behaviors).find(
    (b) => b.displayName.toLowerCase() === "none"
  )?.id;
  const ctx = {
    behaviors,
    layerId: (index: number) => keymap.layers[index]?.id,
  };

  // Remember what we change so it can be undone
  const oldBindings: [number, number, BehaviorBinding][] = [];
  const oldNames: [number, string][] = [];

  const layerCount = Math.min(file.layers.length, keymap.layers.length);
  for (let li = 0; li < layerCount; li++) {
    const layer = keymap.layers[li];
    const codes = file.layers[li];

    if (codes.length !== layer.bindings.length) {
      const keys = (n: number) => `${n} key${n === 1 ? "" : "s"}`;
      warnings.push(
        `Layer ${li} has ${keys(codes.length)} in the file, but ${keys(layer.bindings.length)} on the keyboard. ` +
          (codes.length > layer.bindings.length
            ? "The extra keys were skipped."
            : "The rest were left as they were.")
      );
    }

    const name = file.layerNames?.[li];
    if (name !== undefined && name !== layer.name) {
      if (await setLayerName(conn, layer.id, name)) {
        oldNames.push([layer.id, layer.name]);
      } else {
        warnings.push(`Layer ${li}: couldn't set the name "${name}".`);
      }
    }

    const keyCount = Math.min(codes.length, layer.bindings.length);
    for (let k = 0; k < keyCount; k++) {
      let binding: BehaviorBinding;
      try {
        binding = qmkToBinding(codes[k], ctx);
      } catch (e) {
        if (!isImportError(e)) throw e;
        if (noneId === undefined) {
          warnings.push(`Layer ${li}, key ${k}: ${codes[k]} was skipped, ${e.message}.`);
          continue;
        }
        warnings.push(`Layer ${li}, key ${k}: ${codes[k]} was set to None, ${e.message}.`);
        binding = { behaviorId: noneId, param1: 0, param2: 0 };
      }

      const old = layer.bindings[k];
      if (sameBinding(old, binding)) continue;
      if (await setBinding(conn, layer.id, k, binding)) {
        oldBindings.push([layer.id, k, old]);
      } else {
        warnings.push(`Layer ${li}, key ${k}: the keyboard didn't accept ${codes[k]}.`);
      }
    }
  }

  const undo = async () => {
    for (const [layerId, k, binding] of oldBindings) {
      await setBinding(conn, layerId, k, binding);
    }
    for (const [layerId, name] of oldNames) {
      await setLayerName(conn, layerId, name);
    }
    // Added layers were appended, so remove them from the end
    for (let i = 0; i < addedLayerIds.length; i++) {
      const current = await getKeymap(conn);
      const index = current.layers.findIndex(
        (l) => l.id === addedLayerIds[addedLayerIds.length - 1 - i]
      );
      if (index >= 0) {
        await call_rpc(conn, { keymap: { removeLayer: { layerIndex: index } } });
      }
    }
    return getKeymap(conn);
  };

  return {
    keymap: await getKeymap(conn),
    changedKeys: oldBindings.length,
    warnings,
    undo,
  };
}
