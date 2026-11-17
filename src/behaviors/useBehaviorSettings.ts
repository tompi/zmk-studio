import { useCallback, useContext, useEffect, useState } from "react";
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

// Reads the runtime settings (tapping term etc.) of every behavior that has any, and
// changes them through undo/redo. Firmware without the settings RPCs gives an empty list.
export function useBehaviorSettings(behaviors: BehaviorMap) {
  const conn = useContext(ConnectionContext);
  const [list, setList] = useState<BehaviorWithSettings[]>([]);

  useEffect(() => {
    let ignore = false;
    setList([]);

    (async () => {
      if (!conn.conn) return;

      const found: BehaviorWithSettings[] = [];
      for (const b of Object.values(behaviors)) {
        const resp = await call_rpc(conn.conn, {
          behaviors: { getBehaviorSettings: { behaviorId: b.id } },
        });
        if (ignore) return;

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

      if (!ignore) {
        found.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setList(found);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [conn, behaviors]);

  const undoRedo = useContext(UndoRedoContext);

  const setSetting = useCallback(
    (behaviorId: number, settingId: number, value: number) => {
      const current = list
        .find((b) => b.id === behaviorId)
        ?.settings.find((s) => s.id === settingId)?.value;
      if (current === undefined || current === value) return;

      const apply = async (v: number) => {
        if (!conn.conn) throw new Error("Not connected");

        const resp = await call_rpc(conn.conn, {
          behaviors: { setBehaviorSetting: { behaviorId, settingId, value: v } },
        });
        if (
          resp?.behaviors?.setBehaviorSetting !==
          SetBehaviorSettingResponse.SET_BEHAVIOR_SETTING_RESP_OK
        ) {
          throw new Error(
            "Failed to change behavior setting: " +
              resp?.behaviors?.setBehaviorSetting
          );
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

  return [list, setSetting] as const;
}

