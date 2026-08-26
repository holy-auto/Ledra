interface SectionTagProps {
  children: string;
  className?: string;
}

export default function SectionTag({ children, className = "" }: SectionTagProps) {
  return <span className={`section-tag ${className}`}>{children}</span>;
}
