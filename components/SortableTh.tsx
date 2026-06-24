"use client";

export type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition ${active ? "text-gray-700" : "text-gray-300 group-hover:text-gray-400"}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        dir === "desc" ? <path d="M3 5l3 3 3-3" /> : <path d="M3 7l3-3 3 3" />
      ) : (
        <path d="M3.5 5L6 2.5 8.5 5M3.5 7L6 9.5 8.5 7" />
      )}
    </svg>
  );
}

/** A clickable table header that sorts by `col`, showing a direction arrow. */
export default function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  align = "left",
}: {
  label: React.ReactNode;
  col: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (col: string) => void;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`group inline-flex items-center gap-1 hover:text-gray-900 ${justify} ${align === "left" ? "" : "w-full"}`}
      >
        <span>{label}</span>
        <SortArrow active={sortKey === col} dir={sortDir} />
      </button>
    </th>
  );
}
