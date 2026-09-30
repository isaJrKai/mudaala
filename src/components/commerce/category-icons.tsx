// Category → recognizable icon glyph. Low-literacy users navigate by
// pictures, so every category carries a concrete visual cue wherever text
// alone would not be enough (empty photo placeholders, empty states).
//
// Implemented as a map of PRE-BUILT elements at module level — no components
// are created during render, which keeps the React-compiler lint rules happy.
import {
  Beef,
  CookingPot,
  Cpu,
  Hammer,
  HelpCircle,
  Package,
  Recycle,
  Shirt,
  Truck,
  Wheat,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_GLYPHS: Record<string, React.ReactNode> = {
  'scrap-recyclables': <Recycle aria-hidden />,
  'food-groceries': <Wheat aria-hidden />,
  'farm-produce': <Beef aria-hidden />,
  'livestock-feed': <Beef aria-hidden />, // reuse: livestock imagery overlaps with produce
  'hardware-building': <Hammer aria-hidden />,
  'textiles-clothing': <Shirt aria-hidden />,
  electronics: <Cpu aria-hidden />,
  'transport-haulage': <Truck aria-hidden />,
  'home-kitchen': <CookingPot aria-hidden />,
  services: <Wrench aria-hidden />,
  other: <Package aria-hidden />,
}

// Warm, muted tint per category for photo placeholders — recognizable blocks
// of color, no decorative gradients.
export const CATEGORY_TINTS: Record<string, string> = {
  'scrap-recyclables': 'bg-stone-100 text-stone-500',
  'food-groceries': 'bg-amber-50 text-amber-700',
  'farm-produce': 'bg-lime-50 text-lime-700',
  'livestock-feed': 'bg-orange-50 text-orange-700',
  'hardware-building': 'bg-slate-100 text-slate-600',
  'textiles-clothing': 'bg-rose-50 text-rose-700',
  electronics: 'bg-sky-50 text-sky-700',
  'transport-haulage': 'bg-indigo-50 text-indigo-700',
  'home-kitchen': 'bg-teal-50 text-teal-700',
  services: 'bg-violet-50 text-violet-700',
  other: 'bg-secondary text-muted-foreground',
}

export function categoryTint(category: string): string {
  return CATEGORY_TINTS[category] ?? 'bg-secondary text-muted-foreground'
}

// The category glyph itself. Size it from the caller via className using the
// `[&_svg]:size-X` pattern (e.g. "[&_svg]:size-8").
export function CategoryGlyph({ category, className }: { category: string; className?: string }) {
  return <span className={cn('inline-flex', className)}>{CATEGORY_GLYPHS[category] ?? <HelpCircle aria-hidden />}</span>
}
