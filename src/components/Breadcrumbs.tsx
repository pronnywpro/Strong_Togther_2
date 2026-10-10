import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Fragment } from "react";

export type Crumb = {
  label: string;
  to?: string;
  params?: Record<string, string>;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="ניווט" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && <ChevronLeft className="size-3.5 opacity-60" aria-hidden="true" />}
          {item.to && i < items.length - 1 ? (
            <Link
              to={item.to}
              params={item.params as never}
              className="rounded px-1 py-0.5 transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="px-1 py-0.5 font-semibold text-foreground">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
