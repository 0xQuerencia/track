type WordmarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** The brush-painted name. Decorative text is hidden from the accessibility tree by its parent link or heading label. */
export function Wordmark({ size = "md", className = "" }: WordmarkProps) {
  return (
    <span
      className={`brush brush-${size} ${className}`.trim()}
      aria-hidden="true"
    >
      TRACK
    </span>
  );
}
