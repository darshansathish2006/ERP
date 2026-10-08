import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileImage, FileSpreadsheet, FileText, File as FileIcon, Trash2, UploadCloud } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { dateTimeFmt, fileSize } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Badge, Button, Empty, IconButton, Select, Spinner } from '../../components/ui';

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

export function DocumentsTab({ quoteId }: { quoteId: number }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [category, setCategory] = useState(masters.documentCategories[0] || 'General');
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState('');
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
          <Empty title="No documents uploaded" />
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
                  <th style={{ width: 90 }} />
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
    </div>
  );
}
