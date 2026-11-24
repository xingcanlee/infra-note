export {
  STAGE_W,
  RADIUS,
  RADIUS_SM,
  MAX_HUES,
  toneToHue,
  nonSlateHues,
  assertMaxHues,
  estimateTextWidth,
  fitTextMetrics,
  resolveToneStroke,
  resolveToneFill,
  useDiagramMotion,
  type AnyTone,
} from './motion';
export {
  default as BeatExplainer,
  SvgBeatGroup,
  defaultBeats,
  MANIM_EASE,
  MORPH_SPRING,
  type BeatSpec,
  type BeatStageRenderCtx,
  type BeatExplainerProps,
} from './BeatExplainer';
export { default as DataFlowArrow, type DataFlowArrowProps, type Point2D } from './DataFlowArrow';
export { default as ActiveFocusFrame, type ActiveFocusFrameProps } from './ActiveFocusFrame';
export { default as TensorBlock, type TensorBlockProps, type TensorSplit } from './TensorBlock';
export {
  default as ByteLedgerBar,
  type ByteLedgerBarProps,
  type ByteSegment,
} from './ByteLedgerBar';
export { default as HeatmapMatrix, type HeatmapMatrixProps } from './HeatmapMatrix';
export {
  default as ProbabilityBars,
  type ProbabilityBarsProps,
  type ProbBarSeriesItem,
} from './ProbabilityBars';
export {
  SlotStrip,
  PointerArcs,
  type SlotItem,
  type SlotStatus,
  type SlotStripProps,
  type PointerArc,
} from './PointerBoard';
export {
  default as SwimlaneTimeline,
  type TimelineBlock,
  type TimelineLane,
  type TimelineSyncEvent,
  type SwimlaneTimelineProps,
} from './SwimlaneTimeline';
export {
  default as LogRooflineChart,
  type RooflineCeiling,
  type RooflinePoint,
  type LogRooflineChartProps,
} from './LogRooflineChart';
export {
  MetricRow,
  SectionBox,
  type MetricItem,
  type MetricRowProps,
  type SectionBoxProps,
} from './MetricRow';
export { default as SvgRichLabel, type SvgRichLabelProps } from './SvgRichLabel';
