import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';

export type DelegateKind = 'GPU' | 'CPU';
export type VisionStage = 'idle' | 'download' | 'init' | 'ready' | 'error';

export interface VisionLoadState {
  stage: VisionStage;
  loaded: number;
  total: number;
}

const WASM_BASE = '/mediapipe/wasm';
const HAND_MODEL_URL = '/models/hand_landmarker.task';
const FACE_MODEL_URL = '/models/face_landmarker.task';

/** Fallback byte sizes when the server compresses and Content-Length is unusable. */
const SIZE = {
  handModel: 7_819_105,
  faceModel: 3_758_596,
  simd: 11_153_617,
  nosimd: 10_481_398,
};

interface CachedWasm {
  wasmName: string;
  wasmBytes: Uint8Array;
}

let cachedWasm: CachedWasm | null = null;
let wasmDownloadPromise: Promise<CachedWasm> | null = null;

async function fetchBytes(
  url: string,
  estimate: number,
  onBytes: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`资源下载失败（${res.status}）：${url}`);
  const len = Number(res.headers.get('content-length'));
  const total = !res.headers.get('content-encoding') && len > 0 ? len : estimate;
  onBytes(0, total);

  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.length, Math.max(total, buf.length));
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded, Math.max(total, loaded));
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  onBytes(loaded, loaded);
  return out;
}

async function loadWasmOnce(
  onBytes: (loaded: number, total: number) => void,
): Promise<CachedWasm> {
  if (cachedWasm) {
    onBytes(cachedWasm.wasmBytes.length, cachedWasm.wasmBytes.length);
    return cachedWasm;
  }
  if (!wasmDownloadPromise) {
    wasmDownloadPromise = (async () => {
      const { FilesetResolver } = await import('@mediapipe/tasks-vision');
      const simd = await FilesetResolver.isSimdSupported();
      const wasmName = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
      const estimate = simd ? SIZE.simd : SIZE.nosimd;
      const wasmBytes = await fetchBytes(`${WASM_BASE}/${wasmName}.wasm`, estimate, onBytes);
      cachedWasm = { wasmName, wasmBytes };
      return cachedWasm;
    })().catch((err) => {
      wasmDownloadPromise = null;
      throw err;
    });
  }
  const result = await wasmDownloadPromise;
  onBytes(result.wasmBytes.length, result.wasmBytes.length);
  return result;
}

/**
 * Download WASM (cached once across Hand + Face engines) + hand model with real byte progress,
 * then construct HandLandmarker from in-memory bytes.
 */
export async function createHandLandmarker(
  onState: (s: VisionLoadState) => void,
  initialNumHands: 1 | 2 = 1,
): Promise<{ landmarker: HandLandmarker; delegate: DelegateKind }> {
  const { HandLandmarker } = await import('@mediapipe/tasks-vision');

  const wasmEst = cachedWasm ? 0 : SIZE.simd;
  const parts = { wasm: [0, wasmEst], model: [0, SIZE.handModel] };
  const emit = () =>
    onState({
      stage: 'download',
      loaded: parts.wasm[0] + parts.model[0],
      total: Math.max(1, parts.wasm[1] + parts.model[1]),
    });
  emit();

  const [wasm, modelBytes] = await Promise.all([
    loadWasmOnce((l, t) => {
      if (!cachedWasm) {
        parts.wasm = [l, t];
        emit();
      }
    }),
    fetchBytes(HAND_MODEL_URL, SIZE.handModel, (l, t) => {
      parts.model = [l, t];
      emit();
    }),
  ]);

  const total = parts.wasm[1] + modelBytes.length;
  onState({ stage: 'init', loaded: total, total });

  const wasmUrl = URL.createObjectURL(
    new Blob([wasm.wasmBytes as BlobPart], { type: 'application/wasm' }),
  );
  const fileset = { wasmLoaderPath: `${WASM_BASE}/${wasm.wasmName}.js`, wasmBinaryPath: wasmUrl };
  const create = (delegate: DelegateKind) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modelBytes, delegate },
      runningMode: 'VIDEO',
      numHands: initialNumHands,
      minHandDetectionConfidence: 0.58,
      minHandPresenceConfidence: 0.58,
      minTrackingConfidence: 0.58,
    });

  try {
    try {
      return { landmarker: await create('GPU'), delegate: 'GPU' };
    } catch (err) {
      console.warn('[HandEngine] GPU unavailable, falling back to CPU:', err);
      return { landmarker: await create('CPU'), delegate: 'CPU' };
    }
  } finally {
    URL.revokeObjectURL(wasmUrl);
  }
}

/**
 * Lazy-download FaceLandmarker model (reusing cached WASM if already fetched) and build
 * FaceLandmarker with ARKit blendshapes enabled.
 */
export async function createFaceLandmarker(
  onState: (s: VisionLoadState) => void,
): Promise<{ landmarker: FaceLandmarker; delegate: DelegateKind }> {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');

  const wasmEst = cachedWasm ? 0 : SIZE.simd;
  const parts = { wasm: [0, wasmEst], model: [0, SIZE.faceModel] };
  const emit = () =>
    onState({
      stage: 'download',
      loaded: parts.wasm[0] + parts.model[0],
      total: Math.max(1, parts.wasm[1] + parts.model[1]),
    });
  emit();

  const [wasm, modelBytes] = await Promise.all([
    loadWasmOnce((l, t) => {
      if (!cachedWasm) {
        parts.wasm = [l, t];
        emit();
      }
    }),
    fetchBytes(FACE_MODEL_URL, SIZE.faceModel, (l, t) => {
      parts.model = [l, t];
      emit();
    }),
  ]);

  const total = parts.wasm[1] + modelBytes.length;
  onState({ stage: 'init', loaded: total, total });

  const wasmUrl = URL.createObjectURL(
    new Blob([wasm.wasmBytes as BlobPart], { type: 'application/wasm' }),
  );
  const fileset = { wasmLoaderPath: `${WASM_BASE}/${wasm.wasmName}.js`, wasmBinaryPath: wasmUrl };
  const create = (delegate: DelegateKind) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modelBytes, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.52,
      minFacePresenceConfidence: 0.52,
      minTrackingConfidence: 0.52,
    });

  try {
    try {
      return { landmarker: await create('GPU'), delegate: 'GPU' };
    } catch (err) {
      console.warn('[FaceEngine] GPU unavailable, falling back to CPU:', err);
      return { landmarker: await create('CPU'), delegate: 'CPU' };
    }
  } finally {
    URL.revokeObjectURL(wasmUrl);
  }
}
