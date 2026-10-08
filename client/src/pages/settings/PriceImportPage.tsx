import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { PriceLevel } from '../../lib/types';
import { Badge, Button, Field, Select } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { fileSize } from '../../lib/format';
import { ReadOnlyNote, SubPage, useDirty, usePerms } from './common';
import { CATEGORY_LABEL, fetchAllLevelRows, type LevelCategory } from './PriceLevelPage';
import { cellNumber, cellText, findHeader, safeFileName } from './shared';

interface ParsedRow {
  line: number;
  code: string;
  name: string;
  rate: number | null;
}

interface ImportResult {
  updated: number;
  skippedCount: number;
  skipped: string[];
  levelName: string;
}

const CODE_HEADERS = ['rmcode', 'code', 'itemcode', 'rawmaterialcode', 'materialcode'];
const RATE_HEADERS = ['pricelevel', 'rate', 'price', 'newrate', 'newprice'];
const NAME_HEADERS = ['itemname', 'name', 'description'];
const ACCEPT = '.xlsx,.xls,.csv';
const PREVIEW = 20;

/** Reads the first sheet of an .xlsx/.xls/.csv file into rows keyed by header. */
async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  // CSV is read as plain text so codes such as 1-2 are not turned into dates.
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: /\.csv$/i.test(file.name) });
  const first = wb.SheetNames[0];
  const ws = first ? wb.Sheets[first] : undefined;
  if (!ws) throw new Error('The file has no sheets');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

function headersOf(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) set.add(k);
  return [...set];
}

export default function PriceImportPage({ category: preset = 'profile', lockCategory = false }: { category?: LevelCategory; lockCategory?: boolean }) {
  const { refresh } = useMasters();
  const toast = useToast();
  const canEdit = usePerms().rates;
  const [category, setCategory] = useState<LevelCategory>(preset);
  const [levels, setLevels] = useState<PriceLevel[] | null>(null);
  const [levelId, setLevelId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadLevels = useCallback(
    async (cat: LevelCategory) => {
      setLevels(null);
      try {
        const list = await api.get<PriceLevel[]>(`/api/price-levels${qs({ category: cat })}`);
        list.sort((a, b) => (a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1));
        setLevels(list);
        setLevelId(list[0]?.id ?? null);
      } catch (e) {
        setLevels([]);
        toast.error(errorMessage(e));
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadLevels(category);
  }, [category, loadLevels]);

  const valid = rows?.filter((r) => r.code && r.rate !== null && r.rate >= 0) ?? [];
  const invalidCount = (rows?.length ?? 0) - valid.length;
  useDirty(valid.length > 0 && !result);
  const level = levels?.find((l) => l.id === levelId) ?? null;

  function clearFile() {
    setFile(null);
    setRows(null);
    setParseError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setResult(null);
    setParseError(null);
    setRows(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setFile(null);
      setParseError('Choose an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFile(null);
      setParseError('The file is larger than 10 MB.');
      return;
    }
    setFile(f);
    setParsing(true);
    try {
      const data = await readSheet(f);
      const headers = headersOf(data);
      const codeKey = findHeader(headers, CODE_HEADERS);
      const rateKey = findHeader(headers, RATE_HEADERS);
      if (!codeKey || !rateKey) {
        setParseError(`Could not find the ${!codeKey ? '“RM Code”' : ''}${!codeKey && !rateKey ? ' and ' : ''}${!rateKey ? '“Price Level”' : ''} column. Use the template, or name the columns “RM Code” and “Price Level”.`);
        return;
      }
      const nameKey = findHeader(headers, NAME_HEADERS);
      const parsed: ParsedRow[] = [];
      data.forEach((r, i) => {
        const code = cellText(r[codeKey]);
        const rawRate = r[rateKey];
        if (!code && cellText(rawRate) === '') return;
        parsed.push({ line: i + 2, code, name: nameKey ? cellText(r[nameKey]) : '', rate: cellNumber(rawRate) });
      });
      if (!parsed.length) {
        setParseError('The sheet has no rows below the header.');
        return;
      }
      setRows(parsed);
    } catch (e) {
      setParseError(`Could not read the file: ${errorMessage(e)}`);
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (!level || !valid.length) return;
    setImporting(true);
    try {
      const res = await api.post<{ updated: number; skippedCount: number; skipped: string[] }>(`/api/price-levels/${level.id}/import`, {
        rows: valid.map((r) => ({ code: r.code, rate: r.rate })),
      });
      setResult({ ...res, levelName: level.name });
      toast.success(`${res.updated} price${res.updated === 1 ? '' : 's'} updated in ${level.name}`);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  async function downloadTemplate() {
    if (!level) return;
    setDownloading(true);
    try {
      const all = await fetchAllLevelRows(level.id);
      const aoa: (string | number)[][] = [['RM Code', 'Item Name', 'Color', 'Unit', 'Price Level'], ...all.rows.map((r) => [r.code, r.name, r.color, r.unit, r.rate])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 20 }, { wch: 46 }, { wch: 30 }, { wch: 12 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Price list');
      XLSX.writeFile(wb, `${safeFileName(`${CATEGORY_LABEL[category]} - ${level.name}`)}.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SubPage
      actions={
        <Button variant="outline-primary" icon={<Download size={15} />} onClick={() => void downloadTemplate()} loading={downloading} disabled={!level}>
          Download template
        </Button>
      }
    >
      {!canEdit && <ReadOnlyNote>You can download the price list. Ask an administrator for the “Edit raw material and glass price levels” permission to import prices.</ReadOnlyNote>}
      <div className="adm-steps">
        <div className="card adm-step">
          <span className="adm-step-no">1</span>
          <div>
            <div className="adm-step-title">Choose the price level to update</div>
            <div className="adm-cell-sub mb-12">Download the template to get every raw material of the level with its current price.</div>
            <div className="adm-form-grid" style={{ maxWidth: 620 }}>
              <Field label="Category" htmlFor="imp-cat">
                <Select
                  id="imp-cat"
                  value={category}
                  disabled={lockCategory || importing}
                  onChange={(e) => {
                    setCategory(e.target.value as LevelCategory);
                    setResult(null);
                  }}
                >
                  {(lockCategory ? [category] : (['profile', 'reinforcement', 'hardware', 'glass'] as LevelCategory[])).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Price level" htmlFor="imp-level">
                <Select
                  id="imp-level"
                  value={levelId ?? ''}
                  disabled={!levels || !levels.length || importing}
                  onChange={(e) => {
                    setLevelId(Number(e.target.value));
                    setResult(null);
                  }}
                >
                  {!levels && <option value="">Loading…</option>}
                  {levels?.length === 0 && <option value="">No price levels</option>}
                  {levels?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <div className="card adm-step">
          <span className="adm-step-no">2</span>
          <div>
            <div className="adm-step-title">Upload the Excel file</div>
            <div className="adm-cell-sub mb-12">
              The first sheet is read. Columns named <b>RM Code</b> (or Code) and <b>Price Level</b> (or Rate / Price) are required; other columns are ignored.
            </div>
            {file && !parseError ? (
              <div className="adm-file">
                <FileSpreadsheet size={22} className="text-success" />
                <div className="grow">
                  <div className="adm-cell-main ellipsis">{file.name}</div>
                  <div className="adm-cell-sub">
                    {fileSize(file.size)}
                    {parsing ? ' · Reading…' : rows ? ` · ${rows.length} rows found` : ''}
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={clearFile} disabled={importing}>
                  Remove
                </Button>
              </div>
            ) : (
              <div
                className={`adm-drop ${dragOver ? 'over' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
              >
                <Upload size={24} />
                <div className="fw-600">Drop the file here or click to browse</div>
                <div className="adm-cell-sub">.xlsx, .xls or .csv · up to 10 MB</div>
              </div>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
            {parseError && <div className="alert alert-error mt-12">{parseError}</div>}
          </div>
        </div>

        <div className="card adm-step">
          <span className="adm-step-no">3</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="adm-step-title">Review and import</div>
            {!rows ? (
              <div className="adm-cell-sub">Upload a file to preview the prices before importing.</div>
            ) : (
              <>
                <div className="row wrap mb-8">
                  <span className="adm-cell-sub">
                    {rows.length} rows · <b className="text-success">{valid.length} ready</b>
                    {invalidCount > 0 && (
                      <>
                        {' '}
                        · <b className="text-danger">{invalidCount} without a valid code or price</b> (skipped)
                      </>
                    )}
                    {rows.length > PREVIEW && ` · showing the first ${PREVIEW}`}
                  </span>
                </div>
                <div className="table-wrap adm-preview">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Row</th>
                        <th>RM Code</th>
                        <th>Item Name</th>
                        <th className="num">Price Level (₹)</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, PREVIEW).map((r) => {
                        const ok = !!r.code && r.rate !== null && r.rate >= 0;
                        return (
                          <tr key={r.line}>
                            <td className="muted">{r.line}</td>
                            <td className="adm-mono">{r.code || <span className="text-danger">Missing</span>}</td>
                            <td>{r.name || <span className="muted">—</span>}</td>
                            <td className="num">{r.rate === null ? <span className="text-danger">Invalid</span> : r.rate.toFixed(2)}</td>
                            <td>{ok ? <Badge tone="success">Ready</Badge> : <Badge tone="danger">Skipped</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="row mt-12">
                  <Button variant="primary" icon={<Upload size={14} />} onClick={() => void runImport()} loading={importing} disabled={!canEdit || !level || !valid.length || !!result}>
                    Import {valid.length} price{valid.length === 1 ? '' : 's'}
                    {level ? ` into ${level.name}` : ''}
                  </Button>
                  {result && (
                    <Button variant="ghost" onClick={clearFile}>
                      Import another file
                    </Button>
                  )}
                </div>
              </>
            )}
            {result && (
              <div className="alert alert-success mt-12">
                <CheckCircle2 size={16} style={{ flex: 'none', marginTop: 1 }} />
                <div>
                  <div className="fw-600">
                    {result.updated} price{result.updated === 1 ? '' : 's'} updated in {result.levelName}.
                  </div>
                  {result.skippedCount > 0 && (
                    <div className="mt-8">
                      {result.skippedCount} code{result.skippedCount === 1 ? ' was' : 's were'} skipped because {result.skippedCount === 1 ? 'it is' : 'they are'} not a {CATEGORY_LABEL[category].toLowerCase()} raw
                      material or the price was invalid:
                      <div className="adm-skipped">
                        {result.skipped.map((c) => (
                          <span key={c} className="color-chip">
                            {c}
                          </span>
                        ))}
                        {result.skippedCount > result.skipped.length && <span className="adm-cell-sub">+{result.skippedCount - result.skipped.length} more</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SubPage>
  );
}
