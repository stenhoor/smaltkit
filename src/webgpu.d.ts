/**
 * The parts of WebGPU that lib.dom in TypeScript 6.0 and 7.0 leaves out: the flag constants and the 'webgpu' overload of
 * getContext (TypeScript 7.1 adds them; delete this file when the build moves to it). Everything else (GPUDevice,
 * GPUBuffer, …) comes from lib.dom. Used by the geo and graph modules; not shipped (their .d.ts files don't need it).
 */

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}

declare var GPUBufferUsage: {
  readonly MAP_READ: number;
  readonly MAP_WRITE: number;
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly INDEX: number;
  readonly VERTEX: number;
  readonly UNIFORM: number;
  readonly STORAGE: number;
  readonly INDIRECT: number;
  readonly QUERY_RESOLVE: number;
};

declare var GPUTextureUsage: {
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly TEXTURE_BINDING: number;
  readonly STORAGE_BINDING: number;
  readonly RENDER_ATTACHMENT: number;
};

declare var GPUShaderStage: {
  readonly VERTEX: number;
  readonly FRAGMENT: number;
  readonly COMPUTE: number;
};

declare var GPUMapMode: {
  readonly READ: number;
  readonly WRITE: number;
};
