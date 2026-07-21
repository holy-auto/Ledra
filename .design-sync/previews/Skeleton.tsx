import { Skeleton } from "holy-cert";

export function LoadingCard() {
  return (
    <div className="max-w-xs space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton circle width="w-10" height="h-10" />
        <div className="flex-1 space-y-2">
          <Skeleton width="w-2/3" height="h-3" />
          <Skeleton width="w-1/3" height="h-3" />
        </div>
      </div>
      <Skeleton width="w-full" height="h-24" />
    </div>
  );
}
