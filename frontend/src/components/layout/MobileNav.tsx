import { navItems } from "./navItems";

/** Horizontal scrollable section nav (mobile only). */
export function MobileNav() {
  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
      {navItems.map((item, i) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            i === 0
              ? "border-accent/30 bg-accent/10 text-slate-100"
              : "border-white/5 bg-base-800/60 text-slate-400 hover:text-slate-200"
          }`}
        >
          <span className="h-4 w-4">{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
