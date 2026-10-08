import { AlertTriangle, BookmarkPlus, Copy, Edit3, Eye, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { Design } from '../../lib/types';
import { inr } from '../../lib/format';
import { DesignSvg } from '../../configurator/DesignSvg';
import { Checkbox, IconButton } from '../../components/ui';
import { Menu } from '../../components/overlay';

export interface DesignActions {
  onEdit: (d: Design) => void;
  onView: (d: Design) => void;
  onDuplicate: (d: Design) => void;
  onSaveToLibrary: (d: Design) => void;
  onDelete: (d: Design) => void;
}

function menuItems(d: Design, a: DesignActions) {
  return [
    { label: 'Edit design', icon: <Edit3 size={15} />, onClick: () => a.onEdit(d) },
    { label: 'View details', icon: <Eye size={15} />, onClick: () => a.onView(d) },
    { label: 'Duplicate', icon: <Copy size={15} />, onClick: () => a.onDuplicate(d) },
    { label: 'Save to library', icon: <BookmarkPlus size={15} />, onClick: () => a.onSaveToLibrary(d) },
    { separator: true },
    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => a.onDelete(d) },
  ];
}

export function DesignCard({ design: d, selected, onToggle, actions }: { design: Design; selected: boolean; onToggle: (v: boolean) => void; actions: DesignActions }) {
  return (
    <div className={`design-card ${selected ? 'selected' : ''}`}>
      <div className="design-card-top">
        <Checkbox checked={selected} onChange={onToggle} title="Select design" />
        <span className="design-ref">{d.ref}</span>
        <div className="grow" />
        {d.warnings.length > 0 && (
          <span className="design-warn" title={d.warnings.join('\n')}>
            <AlertTriangle size={14} />
          </span>
        )}
        <Menu
          trigger={({ ref, onClick }) => (
            <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Design actions">
              <MoreVertical size={15} />
            </IconButton>
          )}
          items={menuItems(d, actions)}
        />
      </div>
      <div className="design-thumb" onClick={() => actions.onEdit(d)} title="Edit design">
        <DesignSvg data={d.data} frameColor={d.colorHexIn || d.colorHex} showLabels={false} showNumbers={false} fontScale={1.25} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="design-info">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="fw-600 ellipsis">{d.name || '—'}</span>
          <span className="fs-12 muted nowrap">Qty : {d.qty}</span>
        </div>
        <div className="fs-12">
          <span className="muted">Location : </span>
          {d.location || ''}
        </div>
        <div className="fs-12 ellipsis" title={d.systemName}>
          {d.systemName}
        </div>
        <div className="row fs-12" style={{ justifyContent: 'space-between', gap: 6 }}>
          <span className="ellipsis" title={d.glassLabels.join(', ')}>
            <span className="muted">Glass : </span>
            {d.glassLabels.join(', ') || '—'}
          </span>
          <span className="color-chip" title={`Inside ${d.colorInside} / Outside ${d.colorOutside}`}>
            {d.colorName}
          </span>
        </div>
        <div className="fs-12">
          <span className="muted">Price : </span>
          <b>{inr(d.totalPrice)}</b>
          {d.calcType === 'manual' && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Manual rate</span>}
        </div>
      </div>
      <div className="design-card-foot">
        <button className="btn-link btn btn-sm" onClick={() => actions.onView(d)}>
          <Eye size={13} /> View details
        </button>
        <button className="btn-link btn btn-sm" onClick={() => actions.onEdit(d)}>
          <Pencil size={13} /> Edit Design
        </button>
      </div>
    </div>
  );
}

export function DesignRow({ design: d, selected, onToggle, actions }: { design: Design; selected: boolean; onToggle: (v: boolean) => void; actions: DesignActions }) {
  return (
    <tr className={selected ? 'selected' : ''}>
      <td style={{ width: 34 }}>
        <Checkbox checked={selected} onChange={onToggle} />
      </td>
      <td style={{ width: 80 }}>
        <div className="design-mini" onClick={() => actions.onEdit(d)}>
          <DesignSvg data={d.data} frameColor={d.colorHexIn || d.colorHex} showDims={false} showLabels={false} showNumbers={false} style={{ width: '100%', height: '100%' }} />
        </div>
      </td>
      <td className="fw-600">{d.ref}</td>
      <td>{d.name}</td>
      <td>{d.location}</td>
      <td className="nowrap">
        {d.data.width} × {d.data.height}
      </td>
      <td className="num">{d.areaSqft.toFixed(3)}</td>
      <td>{d.systemName}</td>
      <td>
        <span className="color-chip">{d.colorName}</span>
      </td>
      <td className="num">{d.qty}</td>
      <td className="num">{inr(d.unitPrice)}</td>
      <td className="num fw-600">{inr(d.totalPrice)}</td>
      <td className="kebab-cell">
        <Menu
          trigger={({ ref, onClick }) => (
            <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Design actions">
              <MoreVertical size={15} />
            </IconButton>
          )}
          items={menuItems(d, actions)}
        />
      </td>
    </tr>
  );
}
