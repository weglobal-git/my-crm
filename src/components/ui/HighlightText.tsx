import React from 'react';

interface HighlightTextProps {
  text: string;
  highlight?: string;
  highlightClassName?: string;
}

export function HighlightText({ 
  text, 
  highlight = '',
  highlightClassName = 'bg-[#C7F33C] text-black font-bold px-1 rounded-sm'
}: HighlightTextProps) {
  if (!text) return null;
  if (!highlight.trim()) return <>{text}</>;
  
  // Escape regex special characters from the search query
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <span key={i} className={highlightClassName}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export const renderCommentText = (
  text: string, 
  highlight: string = '',
  linkClassName: string = 'text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors cursor-pointer'
) => {
  if (!text) return null;
  const parts = text.split(/(@\S+|(?:https?:\/\/|www\.)[^\s]+)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('@')) {
      return (
        <span key={index} className="font-bold text-black bg-[#C7F33C] px-1.5 py-1 rounded-md text-xs mx-0.5 inline-block">
          {part}
        </span>
      );
    }
    if (/^(?:https?:\/\/|www\.)/i.test(part)) {
      const trailingMatch = part.match(/[.,;!?)]+$/);
      const trailingPunctuation = trailingMatch ? trailingMatch[0] : '';
      const cleanUrl = trailingPunctuation ? part.slice(0, -trailingPunctuation.length) : part;
      const href = cleanUrl.startsWith('www.') ? `https://${cleanUrl}` : cleanUrl;
      return (
        <React.Fragment key={index}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            onClick={(e) => e.stopPropagation()}
          >
            <HighlightText text={cleanUrl} highlight={highlight} />
          </a>
          {trailingPunctuation && <HighlightText text={trailingPunctuation} highlight={highlight} />}
        </React.Fragment>
      );
    }
    return <HighlightText key={index} text={part} highlight={highlight} />;
  });
};
