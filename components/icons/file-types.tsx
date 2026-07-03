import React from "react";

interface FileTypesProps {
  type: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const FileTypes: React.FC<FileTypesProps> = ({
  type,
  size = 24,
  strokeWidth = 2,
  className,
}) => {
  // Uppercase extension
  const label = type.toUpperCase();

  // Adjust font size based on number of letters
  const fontSize = label.length <= 3 ? 6 : 4.5;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "text-inherit"}
    >
      {/* File shape */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />

      {/* File type text */}
      <text
        x="12"
        y="16"
        fontFamily="Arial, sans-serif"
        fontSize={fontSize}
        fontWeight="bold"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </svg>
  );
};

export default FileTypes;
