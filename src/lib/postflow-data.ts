import type { LucideIcon } from "lucide-react";
import {
  Instagram,
  Facebook,
  Youtube,
  Pin,
  Ghost,
} from "lucide-react";

export type PlatformKey =
  | "instagram"
  | "facebook"
  | "pinterest"
  | "youtube"
  | "snapchat";

export type Platform = {
  key: PlatformKey;
  name: string;
  icon: LucideIcon;
  supports: string;
  formats: string;
};

export const platforms: Platform[] = [
  {
    key: "instagram",
    name: "Instagram",
    icon: Instagram,
    supports: "Feed, Reels, Stories",
    formats: "1:1 · 4:5 · 9:16",
  },
  {
    key: "facebook",
    name: "Facebook",
    icon: Facebook,
    supports: "Page feed, Reels, Stories",
    formats: "1:1 · 16:9 · 9:16",
  },
  {
    key: "pinterest",
    name: "Pinterest",
    icon: Pin,
    supports: "Pins, boards",
    formats: "2:3 · 4:5",
  },
  {
    key: "youtube",
    name: "YouTube",
    icon: Youtube,
    supports: "Videos, Shorts",
    formats: "16:9 · 9:16",
  },
  {
    key: "snapchat",
    name: "Snapchat",
    icon: Ghost,
    supports: "Share flow",
    formats: "9:16",
  },
];

export const platformMap = Object.fromEntries(
  platforms.map((p) => [p.key, p]),
) as Record<PlatformKey, Platform>;

export type PostStatus =
  | "draft"
  | "processing"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export type ConnectedAccount = {
  id: string;
  platform: PlatformKey;
  accountName: string;
  username: string;
  status: "connected" | "expiring" | "expired";
  expiry: string;
  lastSync: string;
};

export const connectedAccounts: ConnectedAccount[] = [
  {
    id: "acc_1",
    platform: "instagram",
    accountName: "Northwind Studio",
    username: "@northwind.studio",
    status: "connected",
    expiry: "12 Oct 2026",
    lastSync: "4 minutes ago",
  },
  {
    id: "acc_2",
    platform: "facebook",
    accountName: "Northwind Page",
    username: "/northwindstudio",
    status: "connected",
    expiry: "03 Nov 2026",
    lastSync: "12 minutes ago",
  },
  {
    id: "acc_3",
    platform: "pinterest",
    accountName: "Northwind Pins",
    username: "@northwindpins",
    status: "expiring",
    expiry: "09 Aug 2026",
    lastSync: "2 hours ago",
  },
  {
    id: "acc_4",
    platform: "youtube",
    accountName: "Northwind Films",
    username: "@northwindfilms",
    status: "connected",
    expiry: "27 Dec 2026",
    lastSync: "1 hour ago",
  },
];

export type PostRecord = {
  id: string;
  caption: string;
  platforms: PlatformKey[];
  status: PostStatus;
  scheduledFor: string;
  time: string;
  ratio: string;
  results?: { platform: PlatformKey; state: string; note?: string }[];
};

export const posts: PostRecord[] = [
  {
    id: "post_1041",
    caption: "Behind the scenes of the autumn capsule shoot — full reel drops today.",
    platforms: ["instagram", "facebook"],
    status: "scheduled",
    scheduledFor: "Mon 3 Aug",
    time: "09:30",
    ratio: "9:16",
  },
  {
    id: "post_1040",
    caption: "Three ways to style the linen overshirt. Save this for later.",
    platforms: ["instagram", "pinterest"],
    status: "scheduled",
    scheduledFor: "Tue 4 Aug",
    time: "13:00",
    ratio: "4:5",
  },
  {
    id: "post_1039",
    caption: "Studio tour: how we light every product video in under 20 minutes.",
    platforms: ["youtube", "facebook"],
    status: "published",
    scheduledFor: "Fri 31 Jul",
    time: "17:45",
    ratio: "16:9",
    results: [
      { platform: "youtube", state: "Published" },
      { platform: "facebook", state: "Published" },
    ],
  },
  {
    id: "post_1038",
    caption: "New arrivals are live. Tap the link to shop the collection.",
    platforms: ["instagram", "pinterest", "facebook"],
    status: "partial",
    scheduledFor: "Thu 30 Jul",
    time: "10:15",
    ratio: "1:1",
    results: [
      { platform: "instagram", state: "Published" },
      { platform: "facebook", state: "Published" },
      {
        platform: "pinterest",
        state: "Failed",
        note: "Pinterest publishing failed because the selected board is no longer available. Select another board and retry.",
      },
    ],
  },
  {
    id: "post_1036",
    caption: "Draft: teaser copy for the September restock announcement.",
    platforms: ["instagram"],
    status: "draft",
    scheduledFor: "—",
    time: "—",
    ratio: "4:5",
  },
];

export type MediaItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  format: string;
  dimensions: string;
  duration?: string;
  size: string;
  ratio: string;
  uploaded: string;
  usedIn: number;
  processing: "ready" | "processing" | "failed";
};

export const mediaLibrary: MediaItem[] = [
  {
    id: "m1",
    name: "autumn-capsule-reel.mp4",
    kind: "video",
    format: "MP4",
    dimensions: "1080 × 1920",
    duration: "0:28",
    size: "48.2 MB",
    ratio: "9:16",
    uploaded: "2 Aug 2026",
    usedIn: 3,
    processing: "ready",
  },
  {
    id: "m2",
    name: "linen-overshirt-flatlay.jpg",
    kind: "image",
    format: "JPG",
    dimensions: "1080 × 1350",
    size: "1.9 MB",
    ratio: "4:5",
    uploaded: "1 Aug 2026",
    usedIn: 2,
    processing: "ready",
  },
  {
    id: "m3",
    name: "studio-lighting-tour.mov",
    kind: "video",
    format: "MOV",
    dimensions: "1920 × 1080",
    duration: "6:12",
    size: "412 MB",
    ratio: "16:9",
    uploaded: "30 Jul 2026",
    usedIn: 1,
    processing: "processing",
  },
  {
    id: "m4",
    name: "new-arrivals-square.png",
    kind: "image",
    format: "PNG",
    dimensions: "1080 × 1080",
    size: "2.4 MB",
    ratio: "1:1",
    uploaded: "29 Jul 2026",
    usedIn: 4,
    processing: "ready",
  },
  {
    id: "m5",
    name: "workshop-recap-raw.mp4",
    kind: "video",
    format: "MP4",
    dimensions: "1080 × 1920",
    duration: "1:04",
    size: "96 MB",
    ratio: "9:16",
    uploaded: "28 Jul 2026",
    usedIn: 0,
    processing: "failed",
  },
  {
    id: "m6",
    name: "maker-portrait.webp",
    kind: "image",
    format: "WebP",
    dimensions: "1080 × 1350",
    size: "740 KB",
    ratio: "4:5",
    uploaded: "26 Jul 2026",
    usedIn: 1,
    processing: "ready",
  },
];

export const activity = [
  { label: "Studio tour published to YouTube and Facebook", time: "31 Jul · 17:45" },
  { label: "Pinterest board unavailable — 1 platform failed", time: "30 Jul · 10:16" },
  { label: "autumn-capsule-reel.mp4 finished processing", time: "2 Aug · 08:02" },
  { label: "Northwind Films channel connected", time: "27 Jul · 14:10" },
  { label: "Schedule moved for New arrivals post", time: "29 Jul · 19:22" },
];
