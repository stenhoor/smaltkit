/**
 * Force-directed layout, one tick per dispatch, one invocation per node (d3-force semantics):
 *
 * - many-body repulsion, all pairs, tiled through workgroup memory (256 positions per tile). Above
 *   a node count threshold the host samples a rotating subset of tiles each tick and scales the
 *   force, which keeps a tick O(n · sample) at the cost of some noise that the cooling averages out;
 * - edge springs, gathered from a CSR adjacency so that each node sums its own spring forces and no
 *   atomics are needed (strength 1 / min degree, the lower-degree end moves more);
 * - gravity towards the origin;
 * - damped velocity integration: v = (v + F·alpha)·(1 − decay), p += v.
 *
 * Positions are double-buffered (posIn → posOut; the host copies back). Pinned nodes keep their
 * position; every node's force is scaled by its mobility (1 but after a small change, see place.ts).
 * With dims = 2 the z component stays 0. When the spread changes, every unpinned position (and
 * velocity) is first scaled by rescale around the origin, a little per tick, so the drawing grows
 * or shrinks towards its new size at once and the forces only settle the rest.
 */
export const LAYOUT_WGSL = /* wgsl */ `
struct Params {
  n: u32,
  tiles: u32,
  tileOffset: u32,
  totalTiles: u32,
  dims: u32,
  _p0: u32,
  _p1: u32,
  _p2: u32,
  alpha: f32,
  charge: f32,
  chargeScale: f32,
  distMin2: f32,
  linkDist: f32,
  linkStrength: f32,
  gravity: f32,
  decay: f32,
  maxSpeed: f32,
  rescale: f32,
  _q1: f32,
  _q2: f32,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> posIn: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> posOut: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(4) var<storage, read> pinned: array<u32>;
@group(0) @binding(5) var<storage, read> offsets: array<u32>;
@group(0) @binding(6) var<storage, read> nbrs: array<u32>;
@group(0) @binding(7) var<storage, read> mobility: array<f32>;

const TILE: u32 = 256u;
var<workgroup> tile: array<vec4f, 256>;

// Deterministic small offset for coincident nodes.
fn jiggle(i: u32, j: u32) -> vec3f {
  var h = i * 747796405u + j * 2891336453u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = h ^ (h >> 13u);
  let a = f32(h & 1023u) / 1023.0 - 0.5;
  let b = f32((h >> 10u) & 1023u) / 1023.0 - 0.5;
  let c = f32((h >> 20u) & 1023u) / 1023.0 - 0.5;
  return vec3f(a, b, c) * 1e-3;
}

@compute @workgroup_size(256)
fn tick(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) lid: u32) {
  let i = gid.x;
  let live = i < P.n;
  var pi = vec3f(0.0);
  if (live) {
    pi = posIn[i].xyz * P.rescale;
  }

  // Many-body repulsion.
  var fc = vec3f(0.0);
  for (var t = 0u; t < P.tiles; t = t + 1u) {
    let j = ((t + P.tileOffset) % P.totalTiles) * TILE + lid;
    var q = vec4f(0.0, 0.0, 0.0, -1.0);
    if (j < P.n) {
      q = vec4f(posIn[j].xyz * P.rescale, f32(j));
    }
    tile[lid] = q;
    workgroupBarrier();
    if (live) {
      for (var k = 0u; k < TILE; k = k + 1u) {
        let o = tile[k];
        if (o.w < 0.0) {
          break;
        }
        var d = pi - o.xyz;
        var l = dot(d, d);
        if (l < 1e-12) {
          let j2 = u32(o.w);
          if (j2 == i) {
            continue;
          }
          d = jiggle(i, j2);
          if (P.dims == 2u) {
            d.z = 0.0;
          }
          l = dot(d, d);
        }
        if (l < P.distMin2) {
          l = sqrt(P.distMin2 * l);
        }
        fc = fc + d * (P.charge / l);
      }
    }
    workgroupBarrier();
  }

  if (!live) {
    return;
  }
  if (pinned[i] != 0u) {
    posOut[i] = vec4f(posIn[i].xyz, 1.0);
    vel[i] = vec4f(0.0);
    return;
  }

  let a = P.alpha;
  var f = fc * (P.chargeScale * a);

  // Springs from the CSR adjacency.
  let s = offsets[i];
  let e = offsets[i + 1u];
  let di = f32(e - s);
  for (var k = s; k < e; k = k + 1u) {
    let j = nbrs[k];
    let d = posIn[j].xyz * P.rescale - pi;
    let l = max(length(d), 1e-3);
    let dj = f32(offsets[j + 1u] - offsets[j]);
    let strength = P.linkStrength / min(di, dj);
    let bias = dj / (di + dj);
    f = f + d * ((l - P.linkDist) / l * a * strength * bias);
  }

  // Gravity.
  f = f - pi * (P.gravity * a);
  // After a small change, nodes far from it take only part of the force, so the drawing holds still.
  f = f * mobility[i];

  var v = (vel[i].xyz * P.rescale + f) * (1.0 - P.decay);
  let speed = length(v);
  if (speed > P.maxSpeed) {
    v = v * (P.maxSpeed / speed);
  }
  var p = pi + v;
  if (P.dims == 2u) {
    v.z = 0.0;
    p.z = 0.0;
  }
  posOut[i] = vec4f(p, 1.0);
  vel[i] = vec4f(v, 0.0);
}
`;

/**
 * Builds the start positions of a new graph from the current ones, on the GPU: slot i takes old slot
 * src[i] plus off[i], or off[i] alone when src[i] is NONE. Kept nodes and ghosts start exactly where
 * they are drawn, whatever the CPU last read back.
 */
export const GATHER_WGSL = /* wgsl */ `
struct G {
  count: u32,
  dims: u32,
  _p0: u32,
  _p1: u32,
}

@group(0) @binding(0) var<uniform> P: G;
@group(0) @binding(1) var<storage, read> oldPos: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> outPos: array<vec4f>;
@group(0) @binding(3) var<storage, read> src: array<u32>;
@group(0) @binding(4) var<storage, read> off: array<vec4f>;

@compute @workgroup_size(256)
fn gather(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.count) {
    return;
  }
  var p = off[i].xyz;
  let s = src[i];
  if (s != 0xffffffffu && s < arrayLength(&oldPos)) {
    p = p + oldPos[s].xyz;
  }
  if (P.dims == 2u) {
    p.z = 0.0;
  }
  outPos[i] = vec4f(p, 1.0);
}
`;

/**
 * The fixed layout's animation: each node eases from where it was (`from`) to its slot at the
 * current spread, pivot + (base − pivot) × spread, with t the eased progress 0..1.
 */
export const TWEEN_WGSL = /* wgsl */ `
struct T {
  n: u32,
  dims: u32,
  _p0: u32,
  _p1: u32,
  pivot: vec3f,
  t: f32,
  spread: f32,
  _q0: f32,
  _q1: f32,
  _q2: f32,
}

@group(0) @binding(0) var<uniform> P: T;
@group(0) @binding(1) var<storage, read> basePos: array<vec4f>;
@group(0) @binding(2) var<storage, read> fromPos: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> pos: array<vec4f>;

@compute @workgroup_size(256)
fn tween(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.n) {
    return;
  }
  let to = P.pivot + (basePos[i].xyz - P.pivot) * P.spread;
  var p = mix(fromPos[i].xyz, to, P.t);
  if (P.t >= 1.0) {
    p = to;
  }
  if (P.dims == 2u) {
    p.z = 0.0;
  }
  pos[i] = vec4f(p, 1.0);
}
`;
