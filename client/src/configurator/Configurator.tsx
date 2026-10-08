import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Box,
  BrickWall,
  ChevronDown,
  Columns2,
  CopyPlus,
  Eraser,
  Expand,
  Grid3x3,
  Image as ImageIcon,
  LayoutTemplate,
  Maximize,
  Minus,
  MoreVertical,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Save,
  ScanLine,
  Sparkles,
  SquareDashedBottom,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { Design, DesignData, FullQuote, LeafNode } from '../lib/types';
import { fixed2, inr, qtyFmt } from '../lib/format';
import { useMasters } from '../context/MastersContext';
import { useConfirm, useToast } from '../components/feedback';
import { Button, Field, IconButton, Select, Spinner, Switch, Tabs } from '../components/ui';
import { Drawer, Menu, Popover } from '../components/overlay';
import { DesignSvg, designBounds, GLASS_FILL, type DimTarget } from './DesignSvg';
import {
  defaultDesignData,
  equalize,
  findNode,
  findParent,
  layout,
  mergeSplit,
  nodeRect,
  replaceNode,
  resizeDesign,
  sashCount,
  setChildSize,
  splitLeaf,
  typologyCode,
  updateLeaf,
  validateData,
  type Equalization,
} from './model';
import { LOUVER_TYPES, type DividerOption, type Typology } from './typologies';
import { ColorDrawer, DividerPanel, MullionDrawer, SystemDrawer, TypologyPanel } from './panels';
import { LeftPanel, type DesignMeta, type PreviewProfile } from './LeftPanel';

const View3D = lazy(() => import('./View3D').then((m) => ({ default: m.View3D })));

interface Snapshot {
  data: DesignData;
  systemId: string;
  colorId: string;
  glassId: string;
}

interface Preview {
  areaSqft: number;
  areaSqm: number;
  unitPrice: number;
  basic: number;
  sqftRate: number;
  warnings: string[];
  glassLabels: string[];
  sashes: { label: string; w: number; h: number; weight: number }[];
  heads: { name: string; value: number; visibility: string; calcType: string }[];
  lines: { code: string; name: string; grp: string; category: string; unit: string; qty: number; rate: number; amount: number; color?: string }[];
  profiles: PreviewProfile[];
}

const PANEL_LABEL: Record<string, string> = {
  fixed: 'Fixed glass',
  casement: 'Casement',
  tiltturn: 'Tilt & turn',
  tophung: 'Top hung',
  bottomhung: 'Bottom hung',
  twin: 'French (twin sash)',
  sliding: 'Sliding',
  monorail: 'Monorail',
  bifold: 'Bifold',
  louver: 'Louver',
  fan: 'Exhaust fan',
  mesh: 'Mesh shutter',
};

type ViewMode = '2d' | '3d' | 'section' | 'wall';

function nextRef(designs: Design[]) {
  const refs = designs.map((d) => d.ref.toUpperCase());
  let i = designs.length + 1;
  while (refs.includes(`W${i}`)) i++;
  return `W${i}`;
}

const stripGlass = (n: DesignData['root']): DesignData['root'] =>
  n.kind === 'split' ? { ...n, children: n.children.map(stripGlass) } : n.panel === 'louver' ? n : { ...n, glassId: undefined };

export function Configurator({
  quote,
  designId,
  onClose,
  onSaved,
}: {
  quote: FullQuote;
  designId: number | null;
  onClose: () => void;
  onSaved: (designId: number, close: boolean) => Promise<void>;
}) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const existing = designId != null ? quote.designs.find((d) => d.id === designId) || null : null;
  const defaults = quote.quote.defaults;

  const [currentId, setCurrentId] = useState<number | null>(existing?.id ?? null);
  const [meta, setMeta] = useState<DesignMeta>(() => ({
    ref: existing?.ref ?? nextRef(quote.designs),
    qty: existing?.qty ?? 1,
    name: existing?.name ?? '',
    location: existing?.location ?? '',
    floor: existing?.floor ?? '',
    note: existing?.note ?? '',
  }));
  const [snap, setSnap] = useState<Snapshot>(() => ({
    data: existing?.data ?? defaultDesignData(1500, 1500, defaults.floorAperture ?? masters.company.defaultFloorAperture ?? 900),
    systemId: existing?.systemId ?? defaults.systemId ?? 'inventa-sliding',
    colorId: existing?.colorId ?? defaults.colorId ?? 'white',
    glassId: existing?.glassId ?? defaults.glassId ?? 'g4-pinhead',
  }));
  // Undo/redo stacks live in refs so state updates stay pure (React may run updaters twice).
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const [dirty, setDirty] = useState(!existing);
  const [systemConfirmed, setSystemConfirmed] = useState(!!existing);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'inside' | 'outside'>('inside');
  const [mode, setMode] = useState<ViewMode>('2d');
  const [realistic, setRealistic] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [zoom, setZoom] = useState(0.86);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [flyout, setFlyout] = useState<'divider' | 'design' | null>(null);
  const [drawer, setDrawer] = useState<'system' | 'color' | 'mullion' | 'louver' | 'summary' | null>(null);
  const [pendingTypology, setPendingTypology] = useState<Typology | null>(null);
  const [louverChoice, setLouverChoice] = useState<NonNullable<LeafNode['louverType']>>('fixed-glass');
  const [mullionTarget, setMullionTarget] = useState<string | null>(null);
  const [dimEdit, setDimEdit] = useState<{ target: DimTarget | { kind: 'floor' }; value: string; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'summary' | 'bom'>('summary');
  const [metaErrors, setMetaErrors] = useState<{ ref?: string; qty?: string }>({});
  const warnRef = useRef<HTMLButtonElement | null>(null);
  const clearRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  const { data, systemId, colorId, glassId } = snap;
  const system = masters.systems.find((s) => s.id === systemId) || masters.systems[0];
  const color = masters.colors.find((c) => c.id === colorId) || masters.colors[0];
  const hwColor = color.hw_color || (color.laminated ? 'BROWN' : 'WHITE');
  const frameColor = view === 'inside' ? color.hex_in : color.hex_out;
  const glass = masters.glasses.find((g) => g.id === glassId);
  const selectedNode = selectedId ? findNode(data.root, selectedId) : null;
  const is3d = mode !== '2d';

  // ---------- history ----------
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const syncHistory = () => setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  const commit = useCallback((next: Partial<Snapshot>) => {
    const cur = snapRef.current;
    const updated = { ...cur, ...next };
    history.current.past = [...history.current.past.slice(-99), cur];
    history.current.future = [];
    snapRef.current = updated;
    setSnap(updated);
    syncHistory();
    setDirty(true);
  }, []);
  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past[h.past.length - 1];
    if (!prev) return;
    h.past = h.past.slice(0, -1);
    h.future = [snapRef.current, ...h.future];
    snapRef.current = prev;
    setSnap(prev);
    syncHistory();
    setDirty(true);
  }, []);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    h.future = h.future.slice(1);
    h.past = [...h.past, snapRef.current];
    snapRef.current = next;
    setSnap(next);
    syncHistory();
    setDirty(true);
  }, []);

  // ---------- live preview ----------
  useEffect(() => {
    const t = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const p = await api.post<Preview>(`/api/quotes/${quote.quote.id}/designs/preview`, { id: currentId, qty: meta.qty || 1, systemId, colorId, glassId, data });
        setPreview(p);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [data, systemId, colorId, glassId, meta.qty, currentId, quote.quote.id]);

  const warnings = useMemo(() => [...new Set([...validateData(data), ...(preview?.warnings || [])])], [data, preview]);

  // ---------- editing helpers ----------
  const targetLeafId = (): string | null => {
    if (selectedNode?.kind === 'leaf') return selectedNode.id;
    if (data.root.kind === 'leaf') return data.root.id;
    return null;
  };

  const applyTypologyNow = (t: Typology, sysId?: string, louverType?: LeafNode['louverType']) => {
    const id = targetLeafId();
    if (!id) {
      toast.info('Select a panel on the drawing to apply the design');
      return;
    }
    if (t.apply) {
      const node = findNode(data.root, id);
      if (node?.kind !== 'leaf') return;
      const patched = t.apply(node);
      if (!patched) {
        toast.warning(`${t.label} cannot be applied to a ${PANEL_LABEL[node.panel].toLowerCase()} panel`);
        return;
      }
      commit({ data: { ...data, root: replaceNode(data.root, id, () => patched) } });
      setFlyout(null);
      return;
    }
    const rect = nodeRect(data, id);
    if (!rect) return;
    let built = t.build(rect.w, rect.h);
    if (louverType) {
      const setType = (n: DesignData['root']): DesignData['root'] =>
        n.kind === 'split' ? { ...n, children: n.children.map(setType) } : n.panel === 'louver' ? { ...n, louverType } : n;
      built = setType(built);
    }
    const root = replaceNode(data.root, id, () => built);
    commit({ data: { ...data, root }, ...(sysId ? { systemId: sysId } : {}) });
    setSelectedId(built.kind === 'leaf' ? built.id : null);
    if (!meta.name.trim()) setMeta((m) => ({ ...m, name: typologyCode({ ...data, root }) }));
    setFlyout(null);
  };

  const pickTypology = (t: Typology) => {
    if (!targetLeafId()) {
      toast.info('Select a panel on the drawing to apply the design');
      return;
    }
    if (t.askLouverType) {
      setPendingTypology(t);
      setLouverChoice('fixed-glass');
      setFlyout(null);
      setDrawer('louver');
      return;
    }
    if (t.systemType && (t.systemType !== system.type || !systemConfirmed)) {
      setPendingTypology(t);
      setFlyout(null);
      setDrawer('system');
      return;
    }
    applyTypologyNow(t);
  };

  const pickDivider = (d: DividerOption) => {
    const id = targetLeafId();
    if (!id) {
      toast.info('Select a panel on the drawing to divide');
      return;
    }
    try {
      const next = splitLeaf(data, id, d.dir, d.ratios);
      commit({ data: next });
      const replaced = findReplaced(data, next, id);
      setSelectedId(replaced);
      setMullionTarget(replaced || null);
      setFlyout(null);
      if (replaced) setDrawer('mullion');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onDimClick = (target: DimTarget, ev: React.MouseEvent) => {
    const value = target.kind === 'width' ? data.width : target.kind === 'height' ? data.height : target.value;
    setDimEdit({ target, value: String(Math.round(value * 10) / 10), x: ev.clientX, y: ev.clientY });
  };

  const resizeTo = (w: number, h: number) => {
    const lim = system.limits;
    commit({ data: resizeDesign(data, w, h) });
    if (w < lim.minWidth || w > lim.maxWidth || h < lim.minHeight || h > lim.maxHeight) toast.warning(`Size is outside the ${system.name} range`);
  };

  const applyDim = () => {
    if (!dimEdit) return;
    const v = Number(dimEdit.value);
    const t = dimEdit.target;
    try {
      if (t.kind === 'floor') {
        if (!(v >= 0 && v <= 5000)) throw new Error('Floor aperture distance must be between 0 and 5000 mm');
        commit({ data: { ...data, floorAperture: Math.round(v) } });
      } else if (t.kind === 'width' || t.kind === 'height') {
        if (!(v >= 200 && v <= 12000)) throw new Error('Enter a size between 200 and 12000 mm');
        resizeTo(t.kind === 'width' ? Math.round(v) : data.width, t.kind === 'height' ? Math.round(v) : data.height);
      } else {
        if (!(v > 0)) throw new Error('Enter a valid size');
        commit({ data: setChildSize(data, t.splitId, t.index, v) });
      }
      setDimEdit(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const updateSelectedLeaf = (patch: Partial<LeafNode>) => {
    if (selectedNode?.kind !== 'leaf') return;
    commit({ data: updateLeaf(data, selectedNode.id, patch) });
  };

  const clearBoard = () => {
    commit({ data: { ...data, root: { id: `n${Date.now().toString(36)}`, kind: 'leaf', panel: 'fixed' } } });
    setSelectedId(null);
    setClearOpen(false);
    toast.info('Drawing board cleared');
  };

  const fit = () => {
    setZoom(0.86);
    setPan({ x: 0, y: 0 });
  };

  const applyGlass = (gid: string, scope: 'all' | 'selected') => {
    const g = masters.glasses.find((x) => x.id === gid);
    if (scope === 'selected' && selectedNode?.kind === 'leaf') {
      commit({ data: updateLeaf(data, selectedNode.id, { glassId: gid === glassId ? undefined : gid }) });
      return;
    }
    if (g?.kind === 'louver') {
      toast.info('Louver glass can only be applied to louver panels');
      return;
    }
    commit({ glassId: gid, data: { ...data, root: stripGlass(data.root) } });
  };

  // ---------- save ----------
  const validateMeta = () => {
    const e: typeof metaErrors = {};
    if (!meta.ref.trim()) e.ref = 'Design ref is required';
    if (!(meta.qty >= 1 && meta.qty <= 9999)) e.qty = 'Quantity must be between 1 and 9999';
    setMetaErrors(e);
    if (Object.keys(e).length) {
      setLeftOpen(true);
      toast.error(e.ref || e.qty || 'Please check the basic info');
      return false;
    }
    return true;
  };

  const save = async (saveMode: 'stay' | 'close' | 'copy') => {
    if (!validateMeta()) return;
    const blocking = validateData(data);
    if (blocking.length) {
      toast.error(blocking[0]);
      return;
    }
    setSaving(true);
    const body = {
      ...meta,
      ref: saveMode === 'copy' ? nextRef(quote.designs) : meta.ref.trim(),
      name: meta.name.trim() || typologyCode(data),
      systemId,
      colorId,
      glassId,
      data,
    };
    try {
      const r =
        currentId && saveMode !== 'copy'
          ? await api.put<{ design: Design }>(`/api/designs/${currentId}`, body)
          : await api.post<{ design: Design }>(`/api/quotes/${quote.quote.id}/designs`, body);
      toast.success(saveMode === 'copy' ? `Saved as new design ${r.design.ref}` : 'Data saved successfully');
      setDirty(false);
      if (saveMode !== 'copy') {
        setCurrentId(r.design.id);
        setMeta((m) => ({ ...m, name: r.design.name }));
      }
      await onSaved(r.design.id, saveMode === 'close');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveToLibrary = async () => {
    try {
      await api.post('/api/library', { name: meta.name.trim() || typologyCode(data), systemId, colorId, glassId, data });
      toast.success('Saved to library designs');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const requestClose = async () => {
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'You have unsaved changes in this design. Close without saving?', confirmText: 'Discard', danger: true }))) return;
    onClose();
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (minimized) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save('stay');
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && !drawer) {
        setSelectedId(null);
        setFlyout(null);
        setDimEdit(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ---------- canvas pan / zoom ----------
  const hasSlidingPlan = layout(data).leaves.some((l) => l.node.panel === 'sliding' || l.node.panel === 'monorail');
  const bounds = designBounds(data, { showDims: true, showFloor: true, showPlan: hasSlidingPlan });
  const vw = bounds.w / zoom;
  const vh = bounds.h / zoom;
  const viewBox = `${bounds.x + bounds.w / 2 - vw / 2 + pan.x} ${bounds.y + bounds.h / 2 - vh / 2 + pan.y} ${vw} ${vh}`;
  const unitsPerPx = () => {
    const el = canvasRef.current;
    if (!el) return 1;
    return Math.max(vw / el.clientWidth, vh / el.clientHeight);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (is3d) return;
    setZoom((z) => Math.min(6, Math.max(0.3, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (is3d || e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const u = unitsPerPx();
    setPan({ x: d.px - dx * u, y: d.py - dy * u });
  };
  const onPointerUp = () => {
    window.setTimeout(() => (dragRef.current = null), 0);
  };
  const onCanvasClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // ---------- render ----------
  const leafInfo = selectedNode?.kind === 'leaf' ? selectedNode : null;
  const splitInfo = selectedNode?.kind === 'split' ? selectedNode : null;
  const leafNumber = leafInfo ? layout(data).leaves.find((l) => l.node.id === leafInfo.id)?.no : null;
  const parentOfSelected = selectedId ? findParent(data.root, selectedId) : null;
  const summaryHeads = preview?.heads.filter((h) => h.visibility === 'summary' && (h.value !== 0 || /basic|grand|gst|total project/i.test(h.name))) || [];

  if (minimized) {
    return (
      <div className="cfg-minibar">
        <LayoutTemplate size={16} color="var(--primary)" />
        <span className="fw-600">{meta.ref}</span>
        <span className="muted">{meta.name || typologyCode(data)}</span>
        {dirty && <span className="badge badge-warning">Unsaved</span>}
        <Button size="sm" variant="primary" onClick={() => setMinimized(false)}>
          Restore
        </Button>
      </div>
    );
  }

  return (
    <div className="cfg-backdrop" role="dialog" aria-label="Design configurator">
      <div className="cfg-window">
        {/* ---------------- top bar ---------------- */}
        <header className="cfg-topbar">
          <div className="row gap-8">
            <IconButton tip={leftOpen ? 'Hide panel' : 'Show panel'} tipPos="bottom" onClick={() => setLeftOpen((o) => !o)}>
              {leftOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </IconButton>
            <span className="cfg-title">
              <b>{meta.ref || 'New design'}</b>
              <span className="muted"> · {meta.name || typologyCode(data)}</span>
              {dirty && <span className="cfg-dirty" title="Unsaved changes" />}
            </span>
          </div>
          <div className="cfg-topbar-center">
            <IconButton tip="Undo" tipPos="bottom" disabled={!historySize.past || is3d} onClick={undo}>
              <Undo2 size={16} />
            </IconButton>
            <IconButton tip="Redo" tipPos="bottom" disabled={!historySize.future || is3d} onClick={redo}>
              <Redo2 size={16} />
            </IconButton>
            <IconButton ref={clearRef} tip="Clear" tipPos="bottom" disabled={is3d} onClick={() => setClearOpen((o) => !o)}>
              <Eraser size={16} />
            </IconButton>
            <Popover open={clearOpen} onClose={() => setClearOpen(false)} anchor={clearRef} placement="bottom-start">
              <div className="cfg-confirm">
                <div className="row gap-8 fw-600">
                  <AlertTriangle size={15} color="var(--warning)" /> Are you sure you want to clear the drawing board?
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                  <Button size="sm" onClick={() => setClearOpen(false)}>
                    No
                  </Button>
                  <Button size="sm" variant="primary" onClick={clearBoard}>
                    Yes
                  </Button>
                </div>
              </div>
            </Popover>
            <IconButton tip="Fit to view" tipPos="bottom" disabled={is3d} onClick={fit}>
              <Maximize size={15} />
            </IconButton>
            <IconButton tip="Grid" tipPos="bottom" active={showGrid} onClick={() => setShowGrid((g) => !g)}>
              <Grid3x3 size={15} />
            </IconButton>
          </div>
          <div className="row gap-8">
            <Button size="sm" variant="ghost" className="cfg-summary-btn" onClick={() => setDrawer('summary')}>
              Design summary
            </Button>
            <div className="split-btn">
              <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={() => void save('stay')}>
                Save Design
              </Button>
              <Menu
                trigger={({ ref, onClick }) => (
                  <Button ref={ref} variant="primary" size="sm" onClick={onClick} aria-label="More save options">
                    <ChevronDown size={13} />
                  </Button>
                )}
                items={[
                  { label: 'Save & close', icon: <Save size={15} />, onClick: () => void save('close') },
                  { label: 'Save as new design', icon: <CopyPlus size={15} />, onClick: () => void save('copy') },
                  { label: 'Save to library designs', icon: <BookmarkPlus size={15} />, onClick: () => void saveToLibrary() },
                ]}
              />
            </div>
            <IconButton ref={warnRef} tip="Validation" tipPos="bottom" onClick={() => setWarnOpen((o) => !o)} style={{ position: 'relative' }}>
              <AlertTriangle size={16} color={warnings.length ? 'var(--warning)' : undefined} />
              {warnings.length > 0 && <span className="count-dot">{warnings.length}</span>}
            </IconButton>
            <Popover open={warnOpen} onClose={() => setWarnOpen(false)} anchor={warnRef} placement="bottom-end">
              <div style={{ width: 340, padding: 12 }}>
                <div className="fw-600 mb-8">Validation</div>
                {warnings.length === 0 ? (
                  <div className="alert alert-success">No issues found for {system.name}.</div>
                ) : (
                  <div className="col gap-4">
                    {warnings.map((w) => (
                      <div key={w} className="alert alert-warning fs-12">
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Popover>
            <Menu
              trigger={({ ref, onClick }) => (
                <IconButton ref={ref} tip="More" tipPos="bottom" onClick={onClick}>
                  <MoreVertical size={16} />
                </IconButton>
              )}
              items={[
                { label: 'Minimize', icon: <Minus size={15} />, onClick: () => setMinimized(true) },
                { label: realistic ? 'Simple 3D materials' : 'Realistic 3D materials', icon: <Sparkles size={15} />, onClick: () => setRealistic((r) => !r) },
                { label: 'Reset view', icon: <Maximize size={15} />, onClick: fit },
              ]}
            />
            <IconButton
              tip="Full screen"
              tipPos="bottom"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen?.().catch(() => toast.info('Full screen is not available in this browser'));
              }}
            >
              <Expand size={15} />
            </IconButton>
            <button className="cfg-close" onClick={() => void requestClose()} aria-label="Close configurator" title="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="cfg-main">
          {/* ---------------- left panel ---------------- */}
          {leftOpen && (
            <aside className="cfg-left">
              <LeftPanel
                meta={meta}
                onMeta={(m) => {
                  setMeta(m);
                  setDirty(true);
                  if (metaErrors.ref || metaErrors.qty) setMetaErrors({});
                }}
                data={data}
                onSize={resizeTo}
                onFloorAperture={(v) => commit({ data: { ...data, floorAperture: v } })}
                system={system}
                systems={masters.systems}
                onSystem={(id) => {
                  if (id !== systemId) {
                    commit({ systemId: id });
                    setSystemConfirmed(true);
                  }
                }}
                color={color}
                onOpenColors={() => setDrawer('color')}
                glassId={glassId}
                glasses={masters.glasses}
                onGlass={applyGlass}
                selectedLeaf={leafInfo}
                onLeafPatch={updateSelectedLeaf}
                profiles={preview?.profiles || []}
                hwColor={hwColor}
                errors={metaErrors}
              />
            </aside>
          )}

          {/* ---------------- tool strip ---------------- */}
          <div className="cfg-strip">
            <IconButton tip="Divider" tipPos="right" active={flyout === 'divider'} onClick={() => setFlyout((f) => (f === 'divider' ? null : 'divider'))} disabled={is3d}>
              <Columns2 size={17} />
            </IconButton>
            <IconButton tip="Designs" tipPos="right" active={flyout === 'design'} onClick={() => setFlyout((f) => (f === 'design' ? null : 'design'))} disabled={is3d}>
              <LayoutTemplate size={17} />
            </IconButton>
            <IconButton
              tip="Profile system"
              tipPos="right"
              onClick={() => {
                setPendingTypology(null);
                setDrawer('system');
              }}
            >
              <SquareDashedBottom size={17} />
            </IconButton>
            <div className="cfg-tools-sep" />
            <IconButton tip="Colours" tipPos="right" onClick={() => setDrawer('color')}>
              <Palette size={17} />
            </IconButton>
            <IconButton
              tip="Glass"
              tipPos="right"
              onClick={() => {
                setLeftOpen(true);
                toast.info('Choose the glass in the Glazing Item section of the left panel');
              }}
            >
              <ImageIcon size={17} />
            </IconButton>
          </div>

          {/* ---------------- canvas ---------------- */}
          <div className="cfg-stage">
            <div
              ref={canvasRef}
              className={`cfg-canvas ${showGrid && !is3d ? 'grid' : ''} ${is3d ? 'is3d' : ''}`}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onClickCapture={onCanvasClickCapture}
            >
              {is3d ? (
                <Suspense
                  fallback={
                    <div className="page-loading">
                      <Spinner size="lg" />
                    </div>
                  }
                >
                  <View3D
                    data={data}
                    frameColor={frameColor}
                    glassColor={GLASS_FILL}
                    view={view}
                    wall={mode === 'wall'}
                    section={mode === 'section'}
                    realistic={realistic}
                    style={{ width: '100%', height: '100%' }}
                  />
                </Suspense>
              ) : (
                <DesignSvg
                  data={data}
                  frameColor={frameColor}
                  view={view}
                  showDims
                  showFloor
                  showPlan
                  showLabels
                  showNumbers
                  interactive
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setFlyout(null);
                  }}
                  onDimClick={onDimClick}
                  onFloorClick={(e) => {
                    e.stopPropagation();
                    setDimEdit({ target: { kind: 'floor' }, value: String(data.floorAperture), x: e.clientX, y: e.clientY });
                  }}
                  viewBox={viewBox}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              )}
            </div>

            {flyout === 'divider' && <DividerPanel onPick={pickDivider} />}
            {flyout === 'design' && <TypologyPanel onPick={pickTypology} systemType={system.type} onClose={() => setFlyout(null)} />}

            {/* right-edge view buttons */}
            <div className="cfg-views">
              <button className={`cfg-view-btn ${mode === '3d' ? 'active' : ''}`} data-tip="3D view" data-tip-pos="left" onClick={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}>
                <Box size={17} />
              </button>
              <button className={`cfg-view-btn ${mode === 'section' ? 'active' : ''}`} data-tip="Section view" data-tip-pos="left" onClick={() => setMode((m) => (m === 'section' ? '2d' : 'section'))}>
                <ScanLine size={17} />
              </button>
              <button className={`cfg-view-btn ${mode === 'wall' ? 'active' : ''}`} data-tip="Wall view" data-tip-pos="left" onClick={() => setMode((m) => (m === 'wall' ? '2d' : 'wall'))}>
                <BrickWall size={17} />
              </button>
              {is3d && (
                <button className={`cfg-view-btn ${realistic ? 'active' : ''}`} data-tip="Realistic view" data-tip-pos="left" onClick={() => setRealistic((r) => !r)}>
                  <Sparkles size={17} />
                </button>
              )}
            </div>

            {/* selection context */}
            {!is3d && (leafInfo || splitInfo) && (
              <div className="cfg-card cfg-context">
                {leafInfo && (
                  <>
                    <div className="fw-600 fs-12">
                      Panel {leafNumber} · {PANEL_LABEL[leafInfo.panel]}
                      {leafInfo.panel === 'louver' && ` · ${LOUVER_TYPES.find((t) => t.value === (leafInfo.louverType || 'fixed-glass'))?.label}`}
                    </div>
                    <div className="row wrap gap-8">
                      {(leafInfo.panel === 'sliding' || leafInfo.panel === 'monorail' || leafInfo.panel === 'bifold') && (
                        <label className="row gap-4 fs-12">
                          {leafInfo.panel === 'sliding' ? 'Sashes' : 'Panels'}
                          <Select sm value={sashCount(leafInfo)} onChange={(e) => updateSelectedLeaf({ sashes: Number(e.target.value) })} style={{ width: 64 }}>
                            {[2, 3, 4, 5, 6].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </Select>
                        </label>
                      )}
                      {leafInfo.panel === 'sliding' && (
                        <label className="row gap-4 fs-12">
                          Tracks
                          <Select sm value={leafInfo.mesh ? 3 : leafInfo.tracks || 2} disabled={!!leafInfo.mesh} onChange={(e) => updateSelectedLeaf({ tracks: Number(e.target.value) })} style={{ width: 60 }}>
                            <option>2</option>
                            <option>3</option>
                          </Select>
                        </label>
                      )}
                      {['casement', 'tiltturn', 'mesh'].includes(leafInfo.panel) && (
                        <div className="seg">
                          <button className={leafInfo.hinge !== 'right' ? 'active' : ''} onClick={() => updateSelectedLeaf({ hinge: 'left' })}>
                            Hinge left
                          </button>
                          <button className={leafInfo.hinge === 'right' ? 'active' : ''} onClick={() => updateSelectedLeaf({ hinge: 'right' })}>
                            Hinge right
                          </button>
                        </div>
                      )}
                      {['casement', 'tiltturn', 'twin', 'sliding', 'tophung'].includes(leafInfo.panel) && (
                        <Switch checked={!!leafInfo.mesh} onChange={(v) => updateSelectedLeaf({ mesh: v, ...(leafInfo.panel === 'sliding' && !v ? { tracks: 2 } : {}) })} label="Mesh" />
                      )}
                      {leafInfo.panel !== 'fixed' && (
                        <Button
                          size="xs"
                          onClick={() => commit({ data: updateLeaf(data, leafInfo.id, { panel: 'fixed', sashes: undefined, tracks: undefined, mesh: undefined, hinge: undefined, louverType: undefined }) })}
                        >
                          Make fixed
                        </Button>
                      )}
                      {parentOfSelected && (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={<Trash2 size={12} />}
                          onClick={() => {
                            commit({ data: mergeSplit(data, parentOfSelected.parent.id) });
                            setSelectedId(null);
                          }}
                        >
                          Remove divider
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {splitInfo && (
                  <>
                    <div className="fw-600 fs-12">
                      {splitInfo.dir === 'v' ? 'Vertical' : 'Horizontal'} mullion · {splitInfo.children.length} parts
                    </div>
                    <div className="row wrap gap-8">
                      <Button size="xs" onClick={() => commit({ data: equalize(data, splitInfo.id, 'mullion') })}>
                        Mullion equalization
                      </Button>
                      <Button size="xs" onClick={() => commit({ data: equalize(data, splitInfo.id, 'glass') })}>
                        Glass equalization
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<Trash2 size={12} />}
                        onClick={() => {
                          commit({ data: mergeSplit(data, splitInfo.id) });
                          setSelectedId(null);
                        }}
                      >
                        Remove divider
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* live price */}
            <div className="cfg-card cfg-summary" onClick={() => setDrawer('summary')} role="button" title="Open design summary">
              <div className="fs-11 muted">{system.name}</div>
              <div className="row gap-12 fs-12">
                <span>
                  {data.width} × {data.height} mm
                </span>
                <span>{preview ? `${preview.areaSqft.toFixed(3)} sqft` : '—'}</span>
              </div>
              <div className="row gap-8">
                <b className="fs-16">{preview ? inr(preview.unitPrice) : '—'}</b>
                <span className="fs-11 muted">per unit · {glass?.name}</span>
                {previewLoading && <Spinner />}
              </div>
            </div>

            <div className="cfg-viewtoggle">
              <button className={view === 'inside' ? 'active' : ''} onClick={() => setView('inside')}>
                Inside
              </button>
              <button className={view === 'outside' ? 'active' : ''} onClick={() => setView('outside')}>
                Outside
              </button>
            </div>
          </div>
        </div>
      </div>

      {dimEdit && (
        <div className="cfg-dim-edit" style={{ left: Math.min(dimEdit.x - 60, window.innerWidth - 200), top: Math.min(dimEdit.y - 20, window.innerHeight - 60) }}>
          <input
            type="number"
            autoFocus
            value={dimEdit.value}
            onChange={(e) => setDimEdit({ ...dimEdit, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyDim();
              if (e.key === 'Escape') setDimEdit(null);
            }}
          />
          <span className="fs-11 muted">mm</span>
          <IconButton size="sm" onClick={applyDim} aria-label="Apply">
            <Save size={13} />
          </IconButton>
          <IconButton size="sm" onClick={() => setDimEdit(null)} aria-label="Cancel">
            <X size={13} />
          </IconButton>
        </div>
      )}

      <SystemDrawer
        open={drawer === 'system'}
        systems={masters.systems}
        value={systemId}
        requiredType={pendingTypology?.systemType ?? null}
        onClose={() => {
          setDrawer(null);
          setPendingTypology(null);
        }}
        onConfirm={(id) => {
          setDrawer(null);
          setSystemConfirmed(true);
          if (pendingTypology) applyTypologyNow(pendingTypology, id);
          else if (id !== systemId) commit({ systemId: id });
          setPendingTypology(null);
        }}
      />
      <ColorDrawer
        open={drawer === 'color'}
        colors={masters.colors}
        value={colorId}
        onClose={() => setDrawer(null)}
        onConfirm={(id) => {
          setDrawer(null);
          if (id !== colorId) commit({ colorId: id });
        }}
      />
      <MullionDrawer
        open={drawer === 'mullion'}
        onClose={() => setDrawer(null)}
        onConfirm={(m: Equalization) => {
          setDrawer(null);
          if (mullionTarget) commit({ data: equalize(data, mullionTarget, m) });
          setMullionTarget(null);
        }}
      />
      <Drawer
        open={drawer === 'louver'}
        onClose={() => {
          setDrawer(null);
          setPendingTypology(null);
        }}
        title="Select Louver Type"
        footer={
          <Button
            variant="primary"
            style={{ width: '100%' }}
            onClick={() => {
              setDrawer(null);
              if (pendingTypology) applyTypologyNow(pendingTypology, undefined, louverChoice);
              setPendingTypology(null);
            }}
          >
            Confirm
          </Button>
        }
      >
        <Field label="Select louver type" required>
          <div className="col gap-8">
            {LOUVER_TYPES.map((t) => (
              <label key={t.value} className={`cfg-glass ${louverChoice === t.value ? 'selected' : ''}`}>
                <input type="radio" name="louver" checked={louverChoice === t.value} onChange={() => setLouverChoice(t.value)} />
                <span className="grow">{t.label}</span>
              </label>
            ))}
          </div>
        </Field>
      </Drawer>
      <Drawer open={drawer === 'summary'} onClose={() => setDrawer(null)} title="Design summary" width="wide">
        {!preview ? (
          <div className="page-loading">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="col gap-16">
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div style={{ width: 220, height: 220, background: '#f7f9fb', borderRadius: 8, flex: 'none' }}>
                <DesignSvg data={data} frameColor={color.hex_in} showLabels={false} style={{ width: '100%', height: '100%' }} />
              </div>
              <table className="table table-compact grow">
                <tbody>
                  <tr><td className="muted">Design</td><td>{meta.ref} · {meta.name || typologyCode(data)}</td></tr>
                  <tr><td className="muted">Size</td><td>W = {fixed2(data.width)}, H = {fixed2(data.height)}</td></tr>
                  <tr><td className="muted">Area</td><td>{preview.areaSqm.toFixed(3)} Sqmt / {preview.areaSqft.toFixed(3)} Sqft</td></tr>
                  <tr><td className="muted">System</td><td>{system.name}</td></tr>
                  <tr><td className="muted">Colour</td><td>In {color.inside} / Out {color.outside} · hardware {hwColor}</td></tr>
                  <tr><td className="muted">Glass</td><td>{preview.glassLabels.join(', ') || '—'}</td></tr>
                  <tr><td className="muted">Shutter weight</td><td>{preview.sashes.map((s) => `${s.label}-${s.weight}`).join('; ') || '—'}{preview.sashes.length ? ' kg' : ''}</td></tr>
                  <tr><td className="muted">Unit price</td><td className="fw-600">{inr(preview.unitPrice)} <span className="muted fs-12">({inr(preview.sqftRate)}/sqft basic)</span></td></tr>
                  <tr><td className="muted">Total ({meta.qty || 1} pcs)</td><td className="fw-600">{inr(preview.unitPrice * (meta.qty || 1))}</td></tr>
                </tbody>
              </table>
            </div>
            {warnings.length > 0 && (
              <div className="alert alert-warning">
                <div>
                  {warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              </div>
            )}
            <Tabs
              value={summaryTab}
              onChange={setSummaryTab}
              tabs={[
                { value: 'summary', label: 'Price summary' },
                { value: 'bom', label: 'Bill of materials', count: preview.lines.length },
              ]}
            />
            {summaryTab === 'summary' ? (
              <table className="table table-compact">
                <tbody>
                  {summaryHeads.map((h) => (
                    <tr key={h.name} className={/grand/i.test(h.name) ? 'highlight' : ''}>
                      <td className={/grand|basic/i.test(h.name) ? 'fw-600' : ''}>{h.name}</td>
                      <td className="num">{inr(h.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Code</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.code}>
                      <td>
                        {l.name}
                        <div className="muted fs-11">{l.grp}</div>
                      </td>
                      <td className="muted">{l.code}</td>
                      <td className="num">{qtyFmt(l.qty, l.unit)}</td>
                      <td>{l.unit}</td>
                      <td className="num">{fixed2(l.rate)}</td>
                      <td className="num">{fixed2(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/** After splitting a leaf, its id is gone: the node now at that position is the new split. */
function findReplaced(before: DesignData, after: DesignData, leafId: string): string | null {
  const beforeParent = findParent(before.root, leafId);
  if (!beforeParent) return after.root.kind === 'split' ? after.root.id : null;
  const parentAfter = findNode(after.root, beforeParent.parent.id);
  if (parentAfter?.kind !== 'split') return null;
  const child = parentAfter.children[beforeParent.index];
  return child?.kind === 'split' ? child.id : null;
}
