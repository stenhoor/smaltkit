/**
 * Render shaders for nodes, edges and labels in both modes. Every vertex shader works in device
 * pixels: it projects node centres with the view-projection matrix, builds its quad in screen space
 * and maps pixels to clip space through `F.target` (the whole canvas for drawing, a single pixel for
 * GPU picking, so the pick pass rasterizes only the pixel under the pointer into a 1×1 r32uint
 * target). Output w is 1, so varyings interpolate linearly in screen space, which is what the
 * signed-distance anti-aliasing needs.
 *
 * Colours are premultiplied (canvas alphaMode 'premultiplied').
 *
 * Transitions (fade and grow in, fade and shrink out, a ring for a change) are computed here from a
 * kind and a start time per node and edge and the frame's clock, so they cost the CPU nothing per frame.
 */
export const DRAW_WGSL = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,
  viewport: vec4f,   // width px, height px, dpr, px per world unit (2D) or focal length px (3D)
  dest: vec4f,       // pixel origin and size of the render target in viewport pixels
  edgeColor: vec4f,
  edgeStrong: vec4f,
  accent: vec4f,
  surface: vec4f,
  text: vec4f,
  fog: vec4f,        // near w, far w, strength, dim alpha
  glyph: vec4f,      // advance px, cell w, cell h, atlas columns
  atlas: vec4f,      // atlas w, atlas h, label gap px, edge width px
  flags: vec4u,      // hovered node + 1, hovered edge + 1, highlight active, mode (0 = 2D, 1 = 3D)
  flags2: vec4u,     // pick pass, arrows, node count, focused node + 1
  anim: vec4f,       // clock ms, enter ms, exit ms, flash ms
  counts: vec4u,     // node slots drawn (live nodes, then ghosts)
}

struct NodeStyle {
  color: u32,
  radius: f32,
  flags: u32,        // bit 0: highlighted; bits 1-2: transition (1 enter, 2 exit, 3 flash)
  start: f32,        // transition start, on the frame's clock
}

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> pos: array<vec4f>;
@group(0) @binding(2) var<storage, read> styles: array<NodeStyle>;
@group(0) @binding(3) var<storage, read> edges: array<vec4u>; // source, target, transition << 1, start (f32 bits)
@group(0) @binding(4) var<storage, read> glyphs: array<vec4u>;
@group(0) @binding(5) var atlasTex: texture_2d<f32>;
@group(0) @binding(6) var atlasSamp: sampler;

const QUAD = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);
const HIDDEN = vec4f(2.0, 2.0, 2.0, 1.0);
const EDGE_BIT: u32 = 0x80000000u;

fn toClip(px: vec2f, depth: f32) -> vec4f {
  let n = (px - F.dest.xy) / F.dest.zw;
  return vec4f(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, depth, 1.0);
}

fn clipToPx(c: vec4f) -> vec2f {
  let ndc = c.xy / c.w;
  return vec2f((ndc.x * 0.5 + 0.5) * F.viewport.x, (0.5 - ndc.y * 0.5) * F.viewport.y);
}

fn isPick() -> bool {
  return F.flags2.x == 1u;
}

fn is3d() -> bool {
  return F.flags.w == 1u;
}

fn easeOut(t: f32) -> f32 {
  let u = 1.0 - t;
  return 1.0 - u * u * u;
}

// A transition at this point: x = size, y = opacity, z = ring strength, w = ring progress 0..1.
fn transition(kind: u32, start: f32) -> vec4f {
  if (kind == 0u) {
    return vec4f(1.0, 1.0, 0.0, 0.0);
  }
  let el = F.anim.x - start;
  if (kind == 1u) {
    let t = easeOut(clamp(el / F.anim.y, 0.0, 1.0));
    return vec4f(mix(0.25, 1.0, t), t, 0.0, 0.0);
  }
  if (kind == 2u) {
    let t = easeOut(1.0 - clamp(el / F.anim.z, 0.0, 1.0));
    return vec4f(mix(0.25, 1.0, t), t, 0.0, 0.0);
  }
  let t = clamp(el / F.anim.w, 0.0, 1.0);
  return vec4f(1.0, 1.0, (1.0 - t) * (1.0 - t), easeOut(t));
}

fn nodeTransition(i: u32) -> vec4f {
  return transition((styles[i].flags >> 1u) & 3u, styles[i].start);
}

fn radiusPx(i: u32, w: f32) -> f32 {
  let dpr = F.viewport.z;
  let grow = nodeTransition(i).x;
  var r = max(styles[i].radius * grow * F.viewport.w / max(w, 1e-6), select(1.75, 2.25, is3d()) * dpr * grow);
  if (isPick()) {
    r = max(r, 5.0 * dpr);
  }
  return r;
}

fn fogFactor(w: f32) -> f32 {
  if (!is3d()) {
    return 1.0;
  }
  let t = clamp((w - F.fog.x) / max(F.fog.y - F.fog.x, 1e-6), 0.0, 1.0);
  return 1.0 - t * F.fog.z;
}

fn emphasized(i: u32) -> bool {
  return (styles[i].flags & 1u) != 0u || F.flags.x == i + 1u || F.flags2.w == i + 1u;
}

fn dimmed(i: u32) -> bool {
  return F.flags.z == 1u && (styles[i].flags & 1u) == 0u && F.flags.x != i + 1u;
}

// ---- nodes ------------------------------------------------------------------------------------

struct NodeOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) color: vec4f,
  @location(2) @interpolate(flat) info: vec4f, // radius px, ring strength, alpha, ring offset px
  @location(3) @interpolate(flat) id: u32,
}

@vertex
fn vs_node(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> NodeOut {
  var o: NodeOut;
  let c = F.viewProj * vec4f(pos[ii].xyz, 1.0);
  o.id = ii + 1u;
  if (c.w <= 1e-6) {
    o.position = HIDDEN;
    return o;
  }
  let dpr = F.viewport.z;
  let r = radiusPx(ii, c.w);
  let tr = nodeTransition(ii);
  let ring = emphasized(ii) && !isPick();
  let flash = select(tr.z, 0.0, isPick());
  let ringOffset = select(0.0, tr.w * 5.0 * dpr, flash > 0.0);
  let ext = r + select(1.0, 4.75 * dpr + ringOffset, ring || flash > 0.0) + 1.0;
  o.local = QUAD[vi] * ext;
  o.position = toClip(clipToPx(c) + o.local, c.z / c.w);
  var a = fogFactor(c.w) * tr.y;
  if (dimmed(ii)) {
    a = a * F.fog.w;
  }
  o.color = unpack4x8unorm(styles[ii].color);
  o.info = vec4f(r, max(select(0.0, 1.0, ring), flash), a, ringOffset);
  return o;
}

@fragment
fn fs_node(in: NodeOut) -> @location(0) vec4f {
  let dpr = F.viewport.z;
  let d = length(in.local);
  let r = in.info.x;
  let fill = clamp(r - d + 0.5, 0.0, 1.0);
  var base = in.color.rgb;
  var col = base;
  if (is3d()) {
    let q = in.local / r;
    let zz = sqrt(max(0.0, 1.0 - dot(q, q)));
    let n = vec3f(q.x, -q.y, zz);
    let l = normalize(vec3f(-0.45, 0.6, 0.66));
    let diff = max(dot(n, l), 0.0);
    let spec = pow(max(dot(reflect(-l, n), vec3f(0.0, 0.0, 1.0)), 0.0), 24.0);
    let rim = pow(1.0 - zz, 3.0);
    col = base * (0.42 + 0.68 * diff) + vec3f(spec * 0.35) - base * rim * 0.25;
  } else if (r > 3.0 * dpr) {
    // Thin surface-coloured outline separates overlapping nodes.
    let inner = clamp(r - 0.9 * dpr - d + 0.5, 0.0, 1.0);
    col = mix(F.surface.rgb, base, inner);
  }
  var rgb = col * fill;
  var a = fill;
  if (in.info.y > 0.0) {
    let r0 = r + 1.25 * dpr + in.info.w;
    let r1 = r0 + 2.25 * dpr;
    let ring = clamp(min(d - r0 + 0.5, r1 - d + 0.5), 0.0, 1.0) * in.info.y;
    rgb = rgb + F.accent.rgb * ring * (1.0 - a);
    a = a + ring * (1.0 - a);
  }
  let m = in.info.z;
  if (a * m < 0.003) {
    discard;
  }
  return vec4f(rgb * m, a * m);
}

@fragment
fn fs_node_pick(in: NodeOut) -> @location(0) u32 {
  if (length(in.local) > in.info.x + 1.0) {
    discard;
  }
  return in.id;
}

// ---- edges ------------------------------------------------------------------------------------

struct EdgeOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,                            // px along (arrow only) and across
  @location(1) @interpolate(flat) shape: vec4f,      // kind (0 line, 1 arrow), half width, arrow length, arrow half width
  @location(2) @interpolate(flat) color: vec4f,      // premultiplied
  @location(3) fog: f32,
  @location(4) @interpolate(flat) id: u32,
}

@vertex
fn vs_edge(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> EdgeOut {
  var o: EdgeOut;
  o.position = HIDDEN;
  o.id = (ii + 1u) | EDGE_BIT;
  let e = edges[ii];
  let n = F.counts.x;
  if (e.x >= n || e.y >= n || e.x == e.y) {
    return o;
  }
  let tr = transition((e.z >> 1u) & 3u, bitcast<f32>(e.w));
  if (tr.y <= 0.0 && !isPick()) {
    return o;
  }
  var ca = F.viewProj * vec4f(pos[e.x].xyz, 1.0);
  var cb = F.viewProj * vec4f(pos[e.y].xyz, 1.0);
  let nearW = 1e-3;
  if (ca.w < nearW && cb.w < nearW) {
    return o;
  }
  var clipA = false;
  var clipB = false;
  if (ca.w < nearW) {
    ca = mix(ca, cb, (nearW - ca.w) / (cb.w - ca.w));
    clipA = true;
  }
  if (cb.w < nearW) {
    cb = mix(cb, ca, (nearW - cb.w) / (ca.w - cb.w));
    clipB = true;
  }
  let sa = clipToPx(ca);
  let sb = clipToPx(cb);
  let delta = sb - sa;
  let len = length(delta);
  if (len < 1e-3) {
    return o;
  }
  let dir = delta / len;
  let nrm = vec2f(-dir.y, dir.x);
  let dpr = F.viewport.z;
  let gap = 1.0 * dpr;
  let ra = select(radiusPx(e.x, ca.w) + gap, 0.0, clipA);
  let rb = select(radiusPx(e.y, cb.w) + gap, 0.0, clipB);

  let hovered = F.flags.y == ii + 1u;
  let hoverNode = F.flags.x;
  let strong = (F.flags.z == 1u && ((styles[e.x].flags | styles[e.y].flags) & 1u) != 0u)
    || hoverNode == e.x + 1u || hoverNode == e.y + 1u;
  let dim = F.flags.z == 1u && !strong && !hovered;

  var hw = 0.5 * F.atlas.w * dpr;
  if (strong || hovered) {
    hw = hw * 1.6;
  }
  hw = hw * mix(0.4, 1.0, tr.x);
  if (isPick()) {
    hw = max(hw, 3.0 * dpr);
  }
  let al = 6.5 * dpr + hw * 2.0;
  let aw = 3.0 * dpr + hw;
  let t0 = ra;
  let t1 = len - rb;
  if (t1 - t0 < 0.5) {
    return o;
  }
  let arrow = F.flags2.y == 1u && !clipB && (t1 - t0) > al * 2.2;
  let lineEnd = select(t1, t1 - al * 0.75, arrow);
  let aa = 1.0;

  var along: f32;
  var across: f32;
  if (vi < 6u) {
    let c = QUAD[vi];
    along = mix(t0, lineEnd, c.x * 0.5 + 0.5);
    across = c.y * (max(hw, 0.5) + aa);
    o.uv = vec2f(0.0, across);
    o.shape = vec4f(0.0, hw, al, aw);
  } else {
    if (!arrow) {
      return o;
    }
    let c = QUAD[vi - 6u];
    let u = mix(-al - aa, aa, c.x * 0.5 + 0.5);
    across = c.y * (aw + aa);
    along = t1 + u;
    o.uv = vec2f(u, across);
    o.shape = vec4f(1.0, hw, al, aw);
  }
  let t = clamp(along / len, 0.0, 1.0);
  let w = mix(ca.w, cb.w, t);
  let depth = mix(ca.z / ca.w, cb.z / cb.w, t);
  o.position = toClip(sa + dir * along + nrm * across, depth);
  o.fog = fogFactor(w);

  var col = F.edgeColor;
  if (hovered) {
    col = F.accent;
  } else if (strong) {
    col = F.edgeStrong;
  }
  var a = col.a * tr.y;
  if (dim) {
    a = a * F.fog.w;
  }
  o.color = vec4f(col.rgb * a, a);
  return o;
}

fn edgeCoverage(in: EdgeOut) -> f32 {
  if (in.shape.x < 0.5) {
    let hw = in.shape.y;
    let w = max(hw, 0.5);
    return clamp(w + 0.5 - abs(in.uv.y), 0.0, 1.0) * min(hw * 2.0, 1.0);
  }
  let l = in.shape.z;
  let w = in.shape.w;
  let side = (abs(in.uv.y) * l + in.uv.x * w) / sqrt(l * l + w * w);
  let base = -(in.uv.x + l);
  return clamp(0.5 - max(side, base), 0.0, 1.0);
}

@fragment
fn fs_edge(in: EdgeOut) -> @location(0) vec4f {
  let a = edgeCoverage(in) * in.fog;
  if (a < 0.003) {
    discard;
  }
  return in.color * a;
}

@fragment
fn fs_edge_pick(in: EdgeOut) -> @location(0) u32 {
  if (edgeCoverage(in) < 0.25) {
    discard;
  }
  return in.id;
}

// ---- labels -----------------------------------------------------------------------------------

struct LabelOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) alpha: f32,
}

// glyphs[i] = (node, atlas slot, character index, label length)
@vertex
fn vs_label(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> LabelOut {
  var o: LabelOut;
  o.position = HIDDEN;
  let g = glyphs[ii];
  let node = g.x;
  if (node >= F.flags2.z) {
    return o;
  }
  let c = F.viewProj * vec4f(pos[node].xyz, 1.0);
  if (c.w <= 1e-6 || c.z / c.w > 1.0) {
    return o;
  }
  let adv = F.glyph.x;
  let cell = F.glyph.yz;
  let cols = u32(F.glyph.w);
  let centre = clipToPx(c);
  let pad = (cell.x - adv) * 0.5;
  let origin = vec2f(
    centre.x - f32(g.w) * adv * 0.5 + f32(g.z) * adv - pad,
    centre.y + radiusPx(node, c.w) + F.atlas.z,
  );
  let corner = QUAD[vi] * 0.5 + 0.5;
  let p = floor(origin + 0.5) + corner * cell;
  let slot = vec2f(f32(g.y % cols), f32(g.y / cols));
  o.uv = (slot + corner) * cell / F.atlas.xy;
  o.position = toClip(p, 0.0);
  var a = fogFactor(c.w) * nodeTransition(node).y;
  if (dimmed(node)) {
    a = a * 0.35;
  }
  o.alpha = a;
  return o;
}

@fragment
fn fs_label(in: LabelOut) -> @location(0) vec4f {
  let t = textureSample(atlasTex, atlasSamp, in.uv);
  let text = t.r;
  let halo = t.g * (1.0 - text) * 0.9;
  let a = (text + halo) * in.alpha;
  if (a < 0.003) {
    discard;
  }
  return vec4f((F.text.rgb * text + F.surface.rgb * halo) * in.alpha, a);
}
`;
