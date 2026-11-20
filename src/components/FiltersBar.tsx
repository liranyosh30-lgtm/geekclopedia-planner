import { EMPTY_FILTERS, type Filters } from '../lib/filters';
import { FORMATS, STATUSES } from '../lib/types';

export default function FiltersBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const active = filters.assignee || filters.format || filters.status;
  return (
    <div className="filters" role="group" aria-label="סינון">
      <label className="filter">
        <span>אחראי</span>
        <select value={filters.assignee} onChange={(e) => onChange({ ...filters, assignee: e.target.value as Filters['assignee'] })}>
          <option value="">כולם</option>
          <option value="liran">לירן (כולל משותף)</option>
          <option value="ella">אלה (כולל משותף)</option>
          <option value="both">שניהם בלבד</option>
          <option value="none">ללא אחראי</option>
        </select>
      </label>
      <label className="filter">
        <span>פורמט</span>
        <select value={filters.format} onChange={(e) => onChange({ ...filters, format: e.target.value as Filters['format'] })}>
          <option value="">הכול</option>
          {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          <option value="none">ללא פורמט</option>
        </select>
      </label>
      <label className="filter">
        <span>סטטוס</span>
        <select value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as Filters['status'] })}>
          <option value="">הכול</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      {active && <button className="linkbtn" onClick={() => onChange(EMPTY_FILTERS)}>ניקוי סינון</button>}
    </div>
  );
}
