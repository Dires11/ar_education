"use client";

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const hex = value || "#6366f1";

  return (
    <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5">
      <div
        className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-border"
        style={{ backgroundColor: hex }}
      >
        <input
          type="color"
          value={hex}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{hex}</span>
    </label>
  );
}
