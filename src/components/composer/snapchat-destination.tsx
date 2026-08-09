// Snapchat publishing destination picker.
// Only surfaces Snapchat actually reports for the connected Public Profile are
// offered. Without verified automatic publishing the card explains that the
// video will be prepared for manual sharing instead.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSnapchatPublicProfileStatus } from "@/lib/snapchat-public-profile.functions";
import {
  SNAPCHAT_DESTINATION_LABEL,
  type SnapchatDestination,
} from "@/lib/snapchat-media-validation";

export function SnapchatDestinationPicker({
  value,
  onChange,
}: {
  value: SnapchatDestination | null;
  onChange: (next: SnapchatDestination) => void;
}) {
  const fetchStatus = useServerFn(getSnapchatPublicProfileStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["snapchat-public-profile-status"],
    queryFn: () => fetchStatus({ data: undefined }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Checking Snapchat publishing options…</p>;
  }

  const destinations = data?.apiAvailable ? (data.destinations ?? []) : [];
  if (destinations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
        Automatic publishing is unavailable. The video will be prepared for manual sharing.
      </p>
    );
  }

  const selected = value && destinations.includes(value) ? value : destinations[0]!;
  return (
    <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-semibold">Publish destination</legend>
      <div className="flex flex-wrap gap-4 pt-1">
        {destinations.map((destination) => (
          <label key={destination} className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="snapchat-destination"
              className="size-4 rounded-full"
              checked={selected === destination}
              onChange={() => onChange(destination)}
            />
            {SNAPCHAT_DESTINATION_LABEL[destination]}
          </label>
        ))}
      </div>
      {data?.publicProfileName && (
        <p className="pt-2 text-[11px] text-muted-foreground">
          Publishing to {data.publicProfileName}
        </p>
      )}
    </fieldset>
  );
}
