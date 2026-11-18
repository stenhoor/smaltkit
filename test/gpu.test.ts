import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GPU_BUFFER, GPU_MAP_READ, gpuAvailable, gpuDevice } from 'smaltkit/gpu';

test('where there is no WebGPU (Node), there is no device, and asking again gives the same answer', async () => {
  assert.equal(await gpuDevice(), null);
  assert.equal(await gpuDevice(), null);
  assert.equal(await gpuAvailable(), false);
});

test("the flags are the WebGPU spec's numbers", () => {
  assert.deepEqual(GPU_BUFFER, { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 64, STORAGE: 128 });
  assert.equal(GPU_MAP_READ, 1);
});
