import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import {
  BehaviorMap,
  exportQmkKeymap,
  guessQmkKeyboard,
  keymapToQmkLayers,
  parseKeymapFile,
  ParsedKeymapFile,
} from "./qmkJson";
import {
  exportVialKeymap,
  fetchQmkMatrix,
  matrixFromDefinitionFile,
  VialFile,
  vialToKeymapFile,
} from "./vial";

export interface ImportSummary {
  changedKeys: number;
  warnings: string[];
}

interface KeymapFileControlsProps {
  keymap: Keymap;
  behaviors: BehaviorMap;
  deviceName: string;
  keyCount: number;
  onImport: (file: ParsedKeymapFile) => Promise<ImportSummary>;
}

const MAX_WARNINGS_SHOWN = 30;

// The QMK names last used for a device, so they don't have to be typed again
function loadQmkNames(deviceName: string) {
  try {
    const saved = localStorage.getItem(`qmkExportNames:${deviceName}`);
    return saved ? (JSON.parse(saved) as { keyboard: string; layout: string }) : undefined;
  } catch {
    return undefined;
  }
}

function saveQmkNames(deviceName: string, names: { keyboard: string; layout: string }) {
  try {
    localStorage.setItem(`qmkExportNames:${deviceName}`, JSON.stringify(names));
  } catch {
    // Not remembering the names is fine
  }
}

type ExportFormat = "qmk" | "vial";

function loadExportFormat(): ExportFormat {
  try {
    return localStorage.getItem("keymapExportFormat") === "vial" ? "vial" : "qmk";
  } catch {
    return "qmk";
  }
}

function saveExportFormat(format: ExportFormat) {
  try {
    localStorage.setItem("keymapExportFormat", format);
  } catch {
    // Not remembering the format is fine
  }
}

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const buttonClass =
  "flex flex-1 items-center justify-center gap-1 px-2 py-1 text-sm rounded hover:bg-base-300 disabled:opacity-50";
const dialogButtonClass = "py-1.5 px-2 rounded-md";
const primaryButtonClass = `${dialogButtonClass} bg-gray-100 text-black hover:bg-gray-300`;
const inputClass = "p-1 border rounded border-base-content border-solid bg-base-100";

export const KeymapFileControls = ({
  keymap,
  behaviors,
  deviceName,
  keyCount,
  onImport,
}: KeymapFileControlsProps) => {
  const fileInput = useRef<HTMLInputElement>(null);

  const [exportNames, setExportNames] = useState<
    | { format: ExportFormat; keyboard: string; layout: string; error?: string }
    | undefined
  >(undefined);
  const exportRef = useModalRef(!!exportNames);
  const exportDefinitionInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<
    { title: string; message: string; warnings: string[] } | undefined
  >(undefined);
  const resultRef = useModalRef(!!result);

  const startExport = () =>
    setExportNames({
      format: loadExportFormat(),
      ...(loadQmkNames(deviceName) ?? guessQmkKeyboard(deviceName, keyCount)),
    });

  // Vial exports need the matrix map, looked up from QMK or read from a definition file
  const doExport = async (definitionFile?: File) => {
    if (!exportNames) return;
    const { format, keyboard, layout } = exportNames;
    saveExportFormat(format);

    if (format === "qmk") {
      saveQmkNames(deviceName, { keyboard, layout });
      const file = exportQmkKeymap(keymap, behaviors, keyboard, layout);
      downloadJson(`${file.keymap}.json`, file);
      setExportNames(undefined);
      return;
    }

    setExporting(true);
    try {
      const matrix = definitionFile
        ? matrixFromDefinitionFile(await definitionFile.text(), layout)
        : await fetchQmkMatrix(keyboard, layout);
      if (!definitionFile) saveQmkNames(deviceName, { keyboard, layout });
      const { file, warnings } = exportVialKeymap(
        keymapToQmkLayers(keymap, behaviors),
        matrix
      );
      const name = (keyboard.trim() || deviceName).replace(/[/\s]+/g, "_");
      downloadJson(`${name}_zmk_studio.vil`, file);
      setExportNames(undefined);
      if (warnings.length) {
        setResult({
          title: "Keymap exported",
          message: "Load it in Vial with File → Load saved layout.",
          warnings,
        });
      }
    } catch (e) {
      setExportNames(
        (n) => n && { ...n, error: e instanceof Error ? e.message : String(e) }
      );
    } finally {
      setExporting(false);
    }
  };

  // A Vial file waiting for the user to say which keyboard it's from
  const [vial, setVial] = useState<
    | { file: VialFile; keyboard: string; layout: string; error?: string }
    | undefined
  >(undefined);
  const vialRef = useModalRef(!!vial);
  const definitionInput = useRef<HTMLInputElement>(null);

  const runImport = async (file: ParsedKeymapFile) => {
    try {
      const { changedKeys, warnings } = await onImport(file);
      setResult({
        title: "Keymap imported",
        message: `${changedKeys} key${changedKeys === 1 ? "" : "s"} changed. Save to keep the changes on the keyboard, or use undo to go back.`,
        warnings,
      });
    } catch (e) {
      setResult({
        title: "Couldn't import the keymap",
        message: e instanceof Error ? e.message : String(e),
        warnings: [],
      });
    }
  };

  const doImport = async (f: File) => {
    setImporting(true);
    try {
      const contents = parseKeymapFile(await f.text());
      if (contents.kind === "vial") {
        setVial({
          file: contents.vial,
          ...(loadQmkNames(deviceName) ?? guessQmkKeyboard(deviceName, keyCount)),
        });
      } else {
        await runImport(contents.file);
      }
    } catch (e) {
      setResult({
        title: "Couldn't import the keymap",
        message: e instanceof Error ? e.message : String(e),
        warnings: [],
      });
    } finally {
      setImporting(false);
    }
  };

  // Map the Vial file's matrix to key order, either looked up from QMK or from a definition file
  const importVial = async (definitionFile?: File) => {
    if (!vial) return;
    setImporting(true);
    try {
      const matrix = definitionFile
        ? matrixFromDefinitionFile(await definitionFile.text(), vial.layout)
        : await fetchQmkMatrix(vial.keyboard, vial.layout);
      if (!definitionFile) {
        saveQmkNames(deviceName, { keyboard: vial.keyboard, layout: vial.layout });
      }
      const file = vialToKeymapFile(vial.file, matrix);
      setVial(undefined);
      await runImport(file);
    } catch (e) {
      setVial((v) => v && { ...v, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex gap-1">
        <button
          type="button"
          className={buttonClass}
          disabled={importing}
          onClick={() => fileInput.current?.click()}
          title="Import a keymap from a QMK Configurator (.json) or Vial (.vil) file"
        >
          <Upload className="size-4" /> Import
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={startExport}
          title="Export the keymap as a QMK Configurator (.json) or Vial (.vil) file"
        >
          <Download className="size-4" /> Export
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.vil,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) doImport(f);
          }}
        />
      </div>

      <GenericModal
        ref={exportRef}
        className="min-w-min w-[30vw]"
        onClose={() => setExportNames(undefined)}
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            doExport();
          }}
        >
          <h2 className="text-lg">Export Keymap</h2>
          <fieldset className="flex gap-4 text-sm">
            {(
              [
                ["qmk", "QMK Configurator (.json)"],
                ["vial", "Vial (.vil)"],
              ] as const
            ).map(([format, label]) => (
              <label key={format} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="exportFormat"
                  checked={exportNames?.format === format}
                  onChange={() =>
                    setExportNames((n) => n && { ...n, format, error: undefined })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="text-sm opacity-80">
            {exportNames?.format === "vial"
              ? "Saves a layout file for Vial's File → Load saved layout. Vial stores keys by switch matrix position, so enter QMK's names for the keyboard you'll load it on, or choose its definition file (info.json, keyboard.json or vial.json)."
              : "Saves a QMK Configurator keymap JSON file. For QMK Configurator to open it, the keyboard and layout must match QMK's names for this keyboard."}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            QMK keyboard
            <input
              className={inputClass}
              value={exportNames?.keyboard ?? ""}
              onChange={(e) =>
                setExportNames(
                  (n) => n && { ...n, keyboard: e.target.value, error: undefined }
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            QMK layout
            <input
              className={inputClass}
              value={exportNames?.layout ?? ""}
              onChange={(e) =>
                setExportNames(
                  (n) => n && { ...n, layout: e.target.value, error: undefined }
                )
              }
            />
          </label>
          {exportNames?.error && (
            <p className="text-sm text-red-500">{exportNames.error}</p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            {exportNames?.format === "vial" && (
              <button
                type="button"
                className={`${dialogButtonClass} mr-auto`}
                disabled={exporting}
                onClick={() => exportDefinitionInput.current?.click()}
              >
                Choose definition file…
              </button>
            )}
            <button
              type="button"
              className={dialogButtonClass}
              onClick={() => setExportNames(undefined)}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={exporting}>
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          <input
            ref={exportDefinitionInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) doExport(f);
            }}
          />
        </form>
      </GenericModal>

      <GenericModal
        ref={vialRef}
        className="min-w-min w-[30vw]"
        onClose={() => setVial(undefined)}
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            importVial();
          }}
        >
          <h2 className="text-lg">Import Vial Keymap</h2>
          <p className="text-sm opacity-80">
            Vial files store keys by switch matrix position, so the keyboard's
            layout is needed to put them in the right place. Enter QMK's names
            for the keyboard the file was saved from, or choose its definition
            file (info.json, keyboard.json or vial.json).
          </p>
          <label className="flex flex-col gap-1 text-sm">
            QMK keyboard
            <input
              className={inputClass}
              value={vial?.keyboard ?? ""}
              onChange={(e) =>
                setVial((v) => v && { ...v, keyboard: e.target.value, error: undefined })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            QMK layout
            <input
              className={inputClass}
              value={vial?.layout ?? ""}
              onChange={(e) =>
                setVial((v) => v && { ...v, layout: e.target.value, error: undefined })
              }
            />
          </label>
          {vial?.error && <p className="text-sm text-red-500">{vial.error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              className={`${dialogButtonClass} mr-auto`}
              disabled={importing}
              onClick={() => definitionInput.current?.click()}
            >
              Choose definition file…
            </button>
            <button
              type="button"
              className={dialogButtonClass}
              onClick={() => setVial(undefined)}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={importing}>
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
          <input
            ref={definitionInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) importVial(f);
            }}
          />
        </form>
      </GenericModal>

      <GenericModal
        ref={resultRef}
        className="min-w-min w-[40vw]"
        onClose={() => setResult(undefined)}
      >
        <h2 className="text-lg">{result?.title}</h2>
        <p className="my-2">{result?.message}</p>
        {!!result?.warnings.length && (
          <>
            <p className="text-sm">Some things didn't import cleanly:</p>
            <ul className="my-2 max-h-60 overflow-y-auto list-disc pl-5 text-sm opacity-80">
              {result.warnings.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {result.warnings.length > MAX_WARNINGS_SHOWN && (
                <li>…and {result.warnings.length - MAX_WARNINGS_SHOWN} more</li>
              )}
            </ul>
          </>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setResult(undefined)}
          >
            OK
          </button>
        </div>
      </GenericModal>
    </>
  );
};
