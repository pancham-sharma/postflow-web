import { CircleCheck, CircleDashed, Clock, Loader, PencilLine, Slash, TriangleAlert, Upload } from "lucide-react";
import type { PostStatus } from "@/lib/postflow-data";
import { cn } from "@/lib/utils";

const config: Record<
  PostStatus,
  { label: string; icon: typeof CircleCheck; variant: "filled" | "outline" | "hatched" | "dashed" }
> = {
  draft: { label: "Draft", icon: PencilLine, variant: "dashed" },
  processing: { label: "Processing", icon: Loader, variant: "hatched" },
  scheduled: { label: "Scheduled", icon: Clock, variant: "outline" },
  publishing: { label: "Publishing", icon: Upload, variant: "hatched" },
  published: { label: "Published", icon: CircleCheck, variant: "filled" },
  partial: { label: "Partially published", icon: CircleDashed, variant: "hatched" },
  failed: { label: "Failed", icon: TriangleAlert, variant: "outline" },
  cancelled: { label: "Cancelled", icon: Slash, variant: "dashed" },
};

export function StatusBadge({ status, className }: { status: PostStatus; className?: string }) {
  const { label, icon: Icon, variant } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        variant === "filled" && "bg-primary text-primary-foreground",
        variant === "outline" && "border border-primary/60 bg-transparent text-foreground",
        variant === "hatched" && "hatch border border-primary/40 text-foreground",
        variant === "dashed" && "border border-dashed border-primary/50 text-foreground/70",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
