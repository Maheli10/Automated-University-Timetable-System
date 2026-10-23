import { useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCsv } from "@shared/courseCode";
import { downloadText } from "@/lib/uov";
import { cn } from "@/lib/utils";
import { Notice, Pill, Table, td, th } from "./common";

export type ImportReport = {
  created?: number;
  updated?: number;
  skipped?: { row: number; reason: string; [key: string]: any }[];
  [key: string]: any;
};

export default function CsvImporter({
  title,
  description,
  templateName,
  templateHeader,
  templateSample,
  requiredColumns,
  options,
  onImport,
  pending,
  report,
  extraSummary,
}: {
  title: string;
  description?: ReactNode;
  templateName: string;
  templateHeader: string;
  templateSample?: string;
  requiredColumns: string[];
  options?: ReactNode;
  onImport: (rows: Record<string, string>[]) => void;
  pending?: boolean;
  report?: ImportReport | null;
  extraSummary?: (report: ImportReport) => ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const read = async (file: File) => {
    setError("");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      setRows([]);
      setError(
        "The file has no data rows. Save it as CSV (comma separated) with the header row on the first line."
      );
      return;
    }
    setRows(parsed);
    setFileName(file.name);
  };
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const normalized = columns.map(c =>
    c.toLowerCase().replace(/[^a-z0-9.]/g, "")
  );
  const missing = requiredColumns.filter(
    c => !normalized.includes(c.toLowerCase().replace(/[^a-z0-9.]/g, ""))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadText(
              templateName,
              `${templateHeader}\n${templateSample || ""}`
            )
          }
        >
          <Download size={14} /> Download template
        </Button>
      </div>
      <div className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-[11px] break-all text-muted-foreground">
        {templateHeader}
      </div>
      {options && (
        <div className="rounded-xl border border-border bg-white p-4">
          {options}
        </div>
      )}

      {!rows.length ? (
        <div
          onDragOver={e => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void read(file);
          }}
          onClick={() => input.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-white hover:border-primary/40"
          )}
        >
          <div className="grid size-12 place-items-center rounded-2xl bg-primary/8 text-primary">
            <UploadCloud size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold">
            Drop a CSV file here or click to browse
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Excel: File → Save As → CSV UTF-8 (Comma delimited)
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void read(file);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-primary" />
              <span className="font-semibold">{fileName}</span>
              <Pill tone="plum">{rows.length} rows</Pill>
              {missing.length ? (
                <Pill tone="red">Missing: {missing.join(", ")}</Pill>
              ) : (
                <Pill tone="green">Columns OK</Pill>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRows([])}>
                <X size={14} /> Clear
              </Button>
              <Button
                size="sm"
                disabled={pending || missing.length > 0}
                onClick={() => onImport(rows)}
              >
                {pending ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <UploadCloud size={14} />
                )}{" "}
                Import {rows.length} rows
              </Button>
            </div>
          </div>
          <Table className="max-h-72">
            <thead>
              <tr>
                <th className={th}>#</th>
                {columns.map(column => (
                  <th key={column} className={th}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, i) => (
                <tr key={i}>
                  <td className={cn(td, "text-muted-foreground")}>{i + 2}</td>
                  {columns.map(column => (
                    <td
                      key={column}
                      className={cn(td, "max-w-[220px] truncate text-xs")}
                    >
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length > 8 && (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              …and {rows.length - 8} more rows
            </p>
          )}
        </div>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      {report && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 size={16} /> Import finished: {report.created ?? 0}{" "}
            created · {report.updated ?? 0} updated ·{" "}
            {report.skipped?.length ?? 0} skipped
          </p>
          {extraSummary && (
            <div className="mt-1 text-sm text-emerald-900">
              {extraSummary(report)}
            </div>
          )}
          {!!report.skipped?.length && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-amber-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className={th}>Row</th>
                    <th className={th}>Record</th>
                    <th className={th}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.skipped.map((item, i) => (
                    <tr key={i}>
                      <td className={td}>{item.row}</td>
                      <td className={td}>
                        {item.email || item.code || item.name || "—"}
                      </td>
                      <td className={cn(td, "text-amber-800")}>
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
