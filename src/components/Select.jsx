/**
 * Select.jsx — small icon + native <select>, shared by ResolveView's
 * inventory/host pickers and App.jsx's playbook switcher.
 */
/* eslint-disable react/prop-types */
export default function Select({ icon: Icon, value, onChange, options, getLabel = (o) => o, getValue = (o) => o, placeholder }) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 min-w-0">
      <Icon size={12} className="text-slate-500 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[11px] font-mono text-slate-200 outline-none min-w-0 max-w-[200px]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={getValue(o)} value={getValue(o)}>{getLabel(o)}</option>
        ))}
      </select>
    </label>
  )
}
