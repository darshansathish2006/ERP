import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Edit3, FileImage, FileSpreadsheet, FileText, File as FileIcon, Trash2, UploadCloud } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { dateTimeFmt, fileSize } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Badge, Button, Empty, Field, IconButton, Input, Select, Spinner } from '../../components/ui';
import { Modal } from '../../components/overlay';

interface Doc {
  id: number;
  name: string;
  mime: string | null;
  size: number;
  category: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

function iconFor(mime: string | null, name: string) {
  if (mime?.startsWith('image/')) return <FileImage size={18} color="#1d63c9" />;
  if (/sheet|excel|csv/.test(mime || '') || /\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet size={18} color="#1b7a43" />;
  if (/pdf/.test(mime || '') || /\.pdf$/i.test(name)) return <FileText size={18} color="#c62828" />;
  return <FileIcon size={18} color="#6b7280" />;
}

/** Rename a document (the file extension is kept) and change its category. */
function EditDocumentDialog({ doc, categories, onClose, onSaved }: { doc: Doc; categories: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(doc.name)?.[0] || '';
  const [name, setName] = useState(ext ? doc.name.slice(0, -ext.length) : doc.name);
  const [category, setCategory] = useState(doc.category);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = categories.includes(doc.category) ? categories : [doc.category, ...categories];

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const n = name.trim();
    if (!n) return setError('Document name is required');
    if (/[\\/:*?"<>|]/.test(n)) return setError('The name cannot contain \\ / : * ? " < > |');
    setError(null);
    setSaving(true);
    try {
      await api.put(`/api/documents/${doc.id}`, { name: n + ext, category });
      await onSaved();
      toast.success('Document updated');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit document"
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="doc-edit-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="doc-edit-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Name" required error={error} hint={ext ? `The ${ext} extension is kept` : undefined} htmlFor="doc-name">
          <Input id="doc-name" value={name} maxLength={190} autoFocus invalid={!!error} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Category" required htmlFor="doc-cat">
          <Select id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {options.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

export function DocumentsTab({ quoteId }: { quoteId: number }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [category, setCategory] = useState(masters.documentCategories[0] || 'General');
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Doc | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setDocs(await api.get<Doc[]>(`/api/quotes/${quoteId}/documents`));
    } catch (e) {
      toast.error(errorMessage(e));
      setDocs([]);
    }
  }, [quoteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > 25 * 1024 * 1024);
    if (tooBig) {
      toast.error(`${tooBig.name} is larger than 25 MB`);
      return;
    }
    if (list.length > 10) {
      toast.error('You can upload up to 10 files at a time');
      return;
    }
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    fd.append('category', category);
    setUploading(true);
    try {
      await api.post(`/api/quotes/${quoteId}/documents`, fd);
      toast.success(`${list.length} file${list.length > 1 ? 's' : ''} uploaded`);
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const download = async (d: Doc) => {
    try {
      const res = await api.raw(`/api/documents/${d.id}/download`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (d: Doc) => {
    if (!(await confirm({ title: 'Delete document', message: `Delete "${d.name}"? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    try {
      await api.del(`/api/documents/${d.id}`);
      toast.success('Document deleted');
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const shown = (docs || []).filter((d) => !filter || d.category === filter);

  return (
    <div className="quote-pane">
      <div
        className={`doc-drop ${drag ? 'drag' : ''}`}
        data-tour="docs-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={30} color="var(--primary)" />
        <div className="fw-600">Drag and drop files here</div>
        <div className="muted fs-12">Site photos, drawings, purchase orders, measurement sheets · up to 25 MB each</div>
        <div className="row mt-8">
          <Select sm value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 190 }} aria-label="Document category">
            {masters.documentCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Button variant="primary" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
        </div>
      </div>

      <div className="list-card mt-16">
        <div className="toolbar">
          <span className="fw-600">Documents</span>
          <span className="muted fs-12">{docs ? `${docs.length} file${docs.length === 1 ? '' : 's'}` : ''}</span>
          <div className="grow" />
          <Select sm value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 190 }} aria-label="Filter by category">
            <option value="">All categories</option>
            {masters.documentCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {!docs ? (
          <div className="page-loading" style={{ minHeight: 160 }}>
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <Empty title={filter && docs.length ? `No ${filter} documents` : 'No documents uploaded'}>
            <span className="muted">{filter && docs.length ? 'Choose another category or upload a file.' : 'Drop files above or click Browse files to add site photos, drawings and purchase orders.'}</span>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th className="num">Size</th>
                  <th>Uploaded by</th>
                  <th>Uploaded on</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="row">
                        {iconFor(d.mime, d.name)}
                        <button className="btn-link btn" onClick={() => void download(d)} style={{ padding: 0 }}>
                          {d.name}
                        </button>
                      </span>
                    </td>
                    <td>
                      <Badge>{d.category}</Badge>
                    </td>
                    <td className="num">{fileSize(d.size)}</td>
                    <td>{d.uploadedBy || '—'}</td>
                    <td>{dateTimeFmt(d.uploadedAt)}</td>
                    <td>
                      <div className="row gap-4">
                        <IconButton size="sm" tip="Download" onClick={() => void download(d)}>
                          <Download size={14} />
                        </IconButton>
                        <IconButton size="sm" tip="Rename / change category" onClick={() => setEditing(d)} data-tour="document-edit">
                          <Edit3 size={14} />
                        </IconButton>
                        <IconButton size="sm" tip="Delete" onClick={() => void remove(d)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <EditDocumentDialog doc={editing} categories={masters.documentCategories} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
