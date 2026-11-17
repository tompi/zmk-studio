import { useCallback, useContext, useEffect, useState } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  BehaviorSetting,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { SetBehaviorSettingResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import { UndoRedoContext } from "../undoRedo";

export type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface BehaviorWithSettings {
  id: number;
  displayName: string;
  settings: BehaviorSetting[];
}

// The runtime settings of every behavior that has any, sorted by name.
// Firmware without the settings RPCs gives an empty list.
export async function fetchBehaviorSettings(
  conn: RpcConnection,
  behaviors: BehaviorMap,
  isCancelled: () => boolean = () => false
): Promise<BehaviorWithSettings[] | undefined> {
  const found: BehaviorWithSettings[] = [];
  for (const b of Object.values(behaviors)) {
    const resp = await call_rpc(conn, {
      behaviors: { getBehaviorSettings: { behaviorId: b.id } },
    });
    if (isCancelled()) return undefined;

    const settings = resp?.behaviors?.getBehaviorSettings?.settings;
    if (!settings) {
      // Firmware without behavior settings answers with an error; no point asking again
      if (!resp?.behaviors) break;
      continue;
    }
    if (settings.length > 0) {
      found.push({ id: b.id, displayName: b.displayName, settings });
    }
  }

  return found.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function setBehaviorSetting(
  conn: RpcConnection,
  behaviorId: number,
  settingId: number,
  value: number
): Promise<boolean> {
  const resp = await call_rpc(conn, {
    behaviors: { setBehaviorSetting: { behaviorId, settingId, value } },
  });
  return (
    resp?.behaviors?.setBehaviorSetting ===
    SetBehaviorSettingResponse.SET_BEHAVIOR_SETTING_RESP_OK
  );
}

// Reads the behavior settings and changes them through undo/redo
export function useBehaviorSettings(behaviors: BehaviorMap) {
  const conn = useContext(ConnectionContext);
  const [list, setList] = useState<BehaviorWithSettings[]>([]);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let ignore = false;
    if (reloads === 0) setList([]);

    (async () => {
      if (!conn.conn) return;
      const found = await fetchBehaviorSettings(conn.conn, behaviors, () => ignore);
      if (found && !ignore) setList(found);
    })();

    return () => {
      ignore = true;
    };
  }, [conn, behaviors, reloads]);

  // Read the settings again, after something else (like an import) changed them
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const undoRedo = useContext(UndoRedoContext);

  const setSetting = useCallback(
    (behaviorId: number, settingId: number, value: number) => {
      const current = list
        .find((b) => b.id === behaviorId)
        ?.settings.find((s) => s.id === settingId)?.value;
      if (current === undefined || current === value) return;

      const apply = async (v: number) => {
        if (!conn.conn) throw new Error("Not connected");

        if (!(await setBehaviorSetting(conn.conn, behaviorId, settingId, v))) {
          throw new Error("The keyboard didn't accept the behavior setting");
        }

        setList((l) =>
          l.map((b) =>
            b.id !== behaviorId
              ? b
              : {
                  ...b,
                  settings: b.settings.map((s) =>
                    s.id === settingId ? { ...s, value: v } : s
                  ),
                }
          )
        );
      };

      undoRedo?.(async () => {
        await apply(value);
        return () => apply(current);
      });
    },
    [conn, list, undoRedo]
  );

  return { list, setSetting, reload };
}
