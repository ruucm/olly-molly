type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
};

export function Select({
  label,
  value,
  onChange,
  options,
  className = "",
}: SelectProps) {
  return (
    <label className="block space-y-2">
      {label ? (
        <span className="text-sm font-semibold text-[var(--ink)]">
          {label}
        </span>
      ) : null}
      <select
        className={`w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] ${className}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
