import Link from 'next/link';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <Link href="/" aria-label="نظرمن — صفحه اصلی" className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-10 place-items-center rounded-[16px] rounded-br-[5px] bg-turquoise-700 text-white shadow-md shadow-turquoise-800/30 ring-1 ring-white/20 ring-inset">
        <span className="pt-0.5 font-display text-[22px] leading-none">ن</span>
      </span>
      <span className="font-display text-[22px] leading-none text-ink-900 md:text-2xl">نظرمن</span>
    </Link>
  );
}
