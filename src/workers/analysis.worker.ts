/// <reference lib="webworker" />
/**
 * Building analysis worker.
 *
 * Triangle rasterisation is the one genuinely expensive step in the pipeline
 * (it scales with mesh surface area), so it runs off the main thread and the
 * result — including the raster's Uint8Array — is transferred back rather than
 * copied.
 */

import { analyzeTriangles } from '../scaffolding/geometry/buildingAnalyzer';
import type { BuildingAnalysis } from '../scaffolding/types';

export interface AnalysisRequest {
  id: number;
  positions: Float32Array;
  targetGrid?: number;
}

export type AnalysisResponse =
  | { id: number; ok: true; analysis: BuildingAnalysis }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, positions, targetGrid } = event.data;
  try {
    const analysis = analyzeTriangles(positions, targetGrid ? { targetGrid } : {});
    const response: AnalysisResponse = { id, ok: true, analysis };
    (self as unknown as Worker).postMessage(response, [analysis.raster.data.buffer]);
  } catch (error) {
    const response: AnalysisResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
