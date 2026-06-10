interface QuestionImageProps {
  url?: string;
  className?: string;
}

// Renders one or more question images. Multiple URLs may be space-separated.
export function QuestionImage({ url, className = '' }: QuestionImageProps) {
  if (!url) return null;
  const urls = url.split(/\s+/).filter(Boolean);
  if (urls.length === 0) return null;

  return (
    <div className={`my-3 flex flex-wrap gap-3 ${className}`}>
      {urls.map((src, i) => (
        <img
          key={i}
          src={src}
          alt="question illustration"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-80 max-w-full rounded-md border border-border"
        />
      ))}
    </div>
  );
}
