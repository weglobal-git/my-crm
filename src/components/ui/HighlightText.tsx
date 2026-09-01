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
