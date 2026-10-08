export type Point = { x: number; y: number };

export type LabelClass = {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
};

export type Keypoint = {
  name: string;
  x: number;
  y: number;
  v: 0 | 1 | 2;
};

export type Box = { x: number; y: number; w: number; h: number };

export type Look = {
  id: string;
  classId: string;
  reason: string;
  points: Point[];
  box?: Box;
  semantic?: Point[];
  pose?: Keypoint[];
  oriented?: Point[];
};

export type CaptureRecord = {
  id: string;
  feedId: string;
  createdAt: string;
  width: number;
  height: number;
  blob: Blob;
  looks: Look[];
  imageClassId: string;
};

export type ScopeRule = {
  id: string;
  classId: string;
  action: string;
};

export type VisionRecord = {
  feedId: string;
  scope: string;
  classes: LabelClass[];
  rules: ScopeRule[];
};

export type Tool = "segment" | "detect" | "semantic" | "pose" | "oriented" | "classify";

export const CLASS_COLORS = ["#7eb6ff", "#f0c36a", "#8fd19e", "#e08cff", "#ff8b7a", "#7ee0d6", "#d7d78a", "#f3a6c8"];

export const PERSON_POSE: { name: string; x: number; y: number }[] = [
  { name: "nose", x: 0, y: -78 },
  { name: "left eye", x: -8, y: -86 },
  { name: "right eye", x: 8, y: -86 },
  { name: "left ear", x: -18, y: -80 },
  { name: "right ear", x: 18, y: -80 },
  { name: "left shoulder", x: -28, y: -52 },
  { name: "right shoulder", x: 28, y: -52 },
  { name: "left elbow", x: -36, y: -22 },
  { name: "right elbow", x: 36, y: -22 },
  { name: "left wrist", x: -40, y: 6 },
  { name: "right wrist", x: 40, y: 6 },
  { name: "left hip", x: -18, y: 8 },
  { name: "right hip", x: 18, y: 8 },
  { name: "left knee", x: -20, y: 48 },
  { name: "right knee", x: 20, y: 48 },
  { name: "left ankle", x: -22, y: 88 },
  { name: "right ankle", x: 22, y: 88 },
];
