import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Badge, Button } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { fileSize } from '../../lib/format';
import { ReadOnlyNote, SubPage, useDirty, usePerms } from './common';
import { cellNumber, cellText, findHeader } from './shared';

type FieldKey = 'projectName' | 'firstName' | 'lastName' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'stage' | 'source' | 'category' | 'estValue' | 'managedBy';

const FIELDS: { key: FieldKey; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'projectName', label: 'Project Name', required: true, aliases: ['projectname', 'project', 'opportunityname'] },
  { key: 'firstName', label: 'First Name', required: true, aliases: ['firstname', 'customername', 'contactname'] },
  { key: 'lastName', label: 'Last Name', aliases: ['lastname', 'surname'] },
  { key: 'phone', label: 'Phone', required: true, aliases: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber'] },
  { key: 'email', label: 'Email', aliases: ['email', 'emailid', 'emailaddress'] },
  { key: 'address', label: 'Address', aliases: ['address', 'address1', 'siteaddress'] },
  { key: 'city', label: 'City', required: true, aliases: ['city'] },
  { key: 'state', label: 'State', aliases: ['state'] },
  { key: 'stage', label: 'Stage', aliases: ['stage'] },
  { key: 'source', label: 'Source', aliases: ['source', 'leadsource'] },
  { key: 'category', label: 'Category', aliases: ['category', 'opportunitycategory'] },
  { key: 'estValue', label: 'Estimated Value', aliases: ['estimatedvalue', 'estvalue', 'value'] },
  { key: 'managedBy', label: 'Managed By', aliases: ['managedby', 'owner', 'salesperson'] },
];

const MAX_ROWS = 2000;
const PREVIEW = 20;

type ImportRow = Record<Exclude<FieldKey, 'estValue'>, string> & { estValue: number | null };

interface ParsedRow {
  line: number;
  row: ImportRow;
  issues: string[];
}

function rowIssues(r: ImportRow): string[] {
  const out: string[] = [];
  if (!r.projectName) out.push('Project name missing');
  if (!r.firstName) out.push('First name missing');
  if (r.phone.replace(/\D/g, '').length < 6) out.push('Phone missing or too short');
  if (!r.city) out.push('City missing');
  return out;
}

export default function OpportunityImportPage() {
  const { masters, refresh } = useMasters();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = usePerms().settings;
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[]; errorCount: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ready = rows?.filter((r) => !r.issues.length) ?? [];
  const problems = (rows?.length ?? 0) - ready.length;
  useDirty(!!rows && rows.length > 0 && !result);

  function clearFile() {
    setFile(null);
    setRows(null);
    setParseError(null);
    setMissingCols([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    clearFile();
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setParseError('Choose an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    setFile(f);
    setParsing(true);
    try {
      // CSV is read as plain text so phone numbers keep their leading zeros / plus sign.
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', raw: /\.csv$/i.test(f.name) });
      const first = wb.SheetNames[0];
      const ws = first ? wb.Sheets[first] : undefined;
      if (!ws) throw new Error('The file has no sheets');
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const headers = [...new Set(data.slice(0, 50).flatMap((r) => Object.keys(r)))];
      const keys = Object.fromEntries(FIELDS.map((fd) => [fd.key, findHeader(headers, fd.aliases)])) as Record<FieldKey, string | null>;
      const missing = FIELDS.filter((fd) => fd.required && !keys[fd.key]).map((fd) => fd.label);
      setMissingCols(missing);
      if (missing.length) {
        setParseError(`Required column${missing.length > 1 ? 's' : ''} not found: ${missing.join(', ')}. Download the template to see the expected columns.`);
        return;
      }
      const parsed: ParsedRow[] = [];
      data.forEach((raw, i) => {
        const get = (k: FieldKey) => (keys[k] ? cellText(raw[keys[k]!]) : '');
        const row: ImportRow = {
          projectName: get('projectName'),
          firstName: get('firstName'),
          lastName: get('lastName'),
          phone: get('phone'),
          email: get('email'),
          address: get('address'),
          city: get('city'),
          state: get('state'),
          stage: get('stage'),
          source: get('source'),
          category: get('category'),
          estValue: keys.estValue ? cellNumber(raw[keys.estValue]) : null,
          managedBy: get('managedBy'),
        };
        if (!Object.values(row).some((v) => v !== '' && v !== null)) return;
        parsed.push({ line: i + 2, row, issues: rowIssues(row) });
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
    if (!ready.length) return;
    setImporting(true);
    try {
      const res = await api.post<{ created: number; errors: string[]; errorCount: number }>('/api/import/opportunities', {
        rows: ready.slice(0, MAX_ROWS).map((r) => r.row),
      });
      setResult(res);
      if (res.created) toast.success(`${res.created} opportunit${res.created === 1 ? 'y' : 'ies'} imported`);
      else toast.warning('No opportunities were imported');
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    try {
      const header = FIELDS.map((f) => (f.required ? `${f.label}*` : f.label));
      const example = [
        'GREEN VILLA',
        'Ramesh',
        'Kumar',
        '9876543210',
        'ramesh@example.com',
        '12, 2nd Street, Anna Nagar',
        'CHENNAI',
        'TAMILNADU',
        masters.stages[0] ?? '',
        masters.sources[0] ?? '',
        masters.categories[0] ?? '',
        150000,
        user?.name ?? '',
      ];
      const ws = XLSX.utils.aoa_to_sheet([header, example]);
      ws['!cols'] = FIELDS.map((f) => ({ wch: Math.max(14, f.label.length + 4) }));
      const lists = XLSX.utils.aoa_to_sheet([
        ['Stage', 'Source', 'Category', 'Managed By'],
        ...Array.from({ length: Math.max(masters.stages.length, masters.sources.length, masters.categories.length, masters.users.length) }, (_, i) => [
          masters.stages[i] ?? '',
          masters.sources[i] ?? '',
          masters.categories[i] ?? '',
          masters.users[i]?.name ?? '',
        ]),
      ]);
      lists['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 24 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Opportunities');
      XLSX.utils.book_append_sheet(wb, lists, 'Allowed values');
      XLSX.writeFile(wb, 'Opportunity import template.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <SubPage
      actions={
        <Button variant="outline-primary" icon={<Download size={15} />} onClick={downloadTemplate}>
          Download template
        </Button>
      }
    >
      {!canEdit && <ReadOnlyNote>Only users with the “Manage settings” permission can import opportunities.</ReadOnlyNote>}
      <div className="adm-steps">
        <div className="card adm-step">
          <span className="adm-step-no">1</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="adm-step-title">Upload the Excel file</div>
            <div className="adm-cell-sub mb-12">
              One opportunity per row. Required columns: <b>Project Name, First Name, Phone, City</b>. Optional: Last Name, Email, Address, State, Stage, Source, Category, Estimated Value,
              Managed By. Unknown stages and sources use the first one in the list; new cities are added automatically. A quote is created for every imported opportunity.
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
                <div className="adm-cell-sub">.xlsx, .xls or .csv · up to {MAX_ROWS} rows</div>
              </div>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
            {parseError && (
              <div className="alert alert-error mt-12">
                {parseError}
                {missingCols.length > 0 && (
                  <Button size="xs" variant="link" onClick={downloadTemplate}>
                    Download template
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card adm-step">
          <span className="adm-step-no">2</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="adm-step-title">Review and import</div>
            {!rows ? (
              <div className="adm-cell-sub">Upload a file to preview the opportunities before importing.</div>
            ) : (
              <>
                <div className="adm-cell-sub mb-8">
                  {rows.length} rows · <b className="text-success">{ready.length} ready</b>
                  {problems > 0 && (
                    <>
                      {' '}
                      · <b className="text-danger">{problems} with problems</b> (skipped)
                    </>
                  )}
                  {rows.length > PREVIEW && ` · showing the first ${PREVIEW}`}
                </div>
                {ready.length > MAX_ROWS && <div className="alert alert-warning mb-8">Only the first {MAX_ROWS} rows are imported at a time. Split the file to import the rest.</div>}
                <div className="table-wrap adm-preview">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Project Name</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>City</th>
                        <th>Stage</th>
                        <th>Source</th>
                        <th className="num">Est. Value</th>
                        <th>Managed By</th>
                        <th>Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, PREVIEW).map(({ line, row, issues }) => (
                        <tr key={line}>
                          <td className="muted">{line}</td>
                          <td className="adm-cell-main">{row.projectName || <span className="text-danger">—</span>}</td>
                          <td>{`${row.firstName} ${row.lastName}`.trim() || <span className="text-danger">—</span>}</td>
                          <td className="nowrap">{row.phone || <span className="text-danger">—</span>}</td>
                          <td>{row.city || <span className="text-danger">—</span>}</td>
                          <td>{row.stage || <span className="muted">{masters.stages[0]}</span>}</td>
                          <td>{row.source || <span className="muted">{masters.sources[0]}</span>}</td>
                          <td className="num">{row.estValue ?? ''}</td>
                          <td>{row.managedBy || <span className="muted">{user?.name}</span>}</td>
                          <td>
                            {issues.length ? (
                              <span title={issues.join('; ')}>
                                <Badge tone="danger">{issues[0]}</Badge>
                              </span>
                            ) : (
                              <Badge tone="success">Ready</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row mt-12">
                  <Button variant="primary" icon={<Upload size={14} />} onClick={() => void runImport()} loading={importing} disabled={!canEdit || !ready.length || !!result}>
                    Import {Math.min(ready.length, MAX_ROWS)} opportunit{Math.min(ready.length, MAX_ROWS) === 1 ? 'y' : 'ies'}
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
              <div className={`alert ${result.errorCount ? 'alert-warning' : 'alert-success'} mt-12`}>
                {result.errorCount ? <CircleAlert size={16} style={{ flex: 'none', marginTop: 1 }} /> : <CheckCircle2 size={16} style={{ flex: 'none', marginTop: 1 }} />}
                <div>
                  <div className="fw-600">
                    {result.created} opportunit{result.created === 1 ? 'y' : 'ies'} created.
                    {result.errorCount > 0 && ` ${result.errorCount} row${result.errorCount === 1 ? '' : 's'} could not be imported:`}
                  </div>
                  {result.errors.length > 0 && (
                    <ul className="adm-errors">
                      {result.errors.map((er) => (
                        <li key={er}>{er}</li>
                      ))}
                    </ul>
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
