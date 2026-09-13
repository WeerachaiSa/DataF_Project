/** Reproducible, original DataF illustration. No third-party model or texture assets. */
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'client/public/models');
await mkdir(path.join(destination, 'draco'), { recursive: true });
const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene('DataF conceptual dormitory');
const material = document.createMaterial('DataF matte architectural palette')
  .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.88).setMetallicFactor(0);
const colors = { white: '#f8faff', navy: '#0f2444', blue: '#1d70ea', glass: '#89bce4', wood: '#d7b889', green: '#7da98d', mint: '#b1c6a7', ground: '#e9eee9', path: '#f8f7f0', gold: '#e9c06b', dark: '#536b81' };
let totalTriangles = 0;
let totalDrawCalls = 0;
const parts = [];

function geometryPart(geometry, position, color, rotation = [0, 0, 0]) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  source.deleteAttribute('uv');
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
  source.applyMatrix4(transform);
  const rgb = new THREE.Color(color);
  const values = new Float32Array(source.getAttribute('position').count * 3);
  for (let index = 0; index < values.length; index += 3) values.set([rgb.r, rgb.g, rgb.b], index);
  source.setAttribute('color', new THREE.BufferAttribute(values, 3));
  if (source !== geometry) geometry.dispose();
  return source;
}
function box(list, size, position, color, rotation) { list.push(geometryPart(new THREE.BoxGeometry(...size), position, color, rotation)); }
function cylinder(list, radiusTop, radiusBottom, height, position, color, segments = 8) { list.push(geometryPart(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), position, color)); }
function tree(list, x, z, scale = 1) {
  cylinder(list, .075 * scale, .11 * scale, 1.2 * scale, [x, .8 * scale, z], colors.wood);
  list.push(geometryPart(new THREE.IcosahedronGeometry(.72 * scale, 1), [x, 1.8 * scale, z], colors.green));
  list.push(geometryPart(new THREE.IcosahedronGeometry(.48 * scale, 0), [x + .35 * scale, 1.55 * scale, z + .12], colors.mint));
}
function addModule(name, geometry, translation, extras) {
  const merged = mergeGeometries(geometry, false);
  const primitive = document.createPrimitive().setMaterial(material);
  for (const [attribute, semantic] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['color', 'COLOR_0']]) {
    primitive.setAttribute(semantic, document.createAccessor(`${name}/${semantic}`).setType('VEC3').setArray(merged.getAttribute(attribute).array).setBuffer(buffer));
  }
  const triangles = merged.getAttribute('position').count / 3;
  totalTriangles += triangles;
  totalDrawCalls += 1;
  const mesh = document.createMesh(name).addPrimitive(primitive);
  const node = document.createNode(name).setMesh(mesh).setTranslation(translation).setExtras(extras);
  scene.addChild(node);
  parts.push({ name, triangles, ...extras });
  geometry.forEach(item => item.dispose());
  merged.dispose();
}

const foundation = [];
box(foundation, [15, .28, 9.5], [0, .06, 0], colors.ground);
box(foundation, [11.4, .24, 5.3], [0, .32, 0], colors.white);
box(foundation, [1.65, .04, 2.4], [0, .23, 3.48], colors.path);
for (const x of [-4.7, -3.5, -2.3, 2.3, 3.5, 4.7]) box(foundation, [.84, .035, .58], [x, .22, 3.45], colors.path);
tree(foundation, -6.3, 2.3, 1.05); tree(foundation, 6.25, -.7, 1.2); tree(foundation, -6.1, -3.1, .85);
for (const x of [-4.4, 4.4]) {
  box(foundation, [1.35, .16, .4], [x, .64, 3.88], colors.wood);
  box(foundation, [.1, .45, .36], [x - .48, .38, 3.88], colors.navy);
  box(foundation, [.1, .45, .36], [x + .48, .38, 3.88], colors.navy);
}
addModule('foundation-and-community-garden', foundation, [0, 0, 0], { assemblyOrder: 0, category: 'foundation' });

for (let floor = 0; floor < 3; floor += 1) {
  const slab = [];
  box(slab, [10.6, .18, 4.75], [0, 0, 0], colors.white);
  box(slab, [10.68, .08, .13], [0, -.025, 2.35], colors.navy);
  box(slab, [.12, .08, 4.72], [-5.3, -.025, 0], colors.navy);
  box(slab, [.12, .08, 4.72], [5.3, -.025, 0], colors.navy);
  if (floor > 0) {
    box(slab, [10.3, .06, .06], [0, .7, 2.25], colors.white);
    for (let column = 0; column <= 12; column += 1) box(slab, [.035, .66, .035], [-5.1 + column * .85, .37, 2.25], colors.white);
  }
  addModule(`floor-${floor + 1}-structural-frame`, slab, [0, .53 + floor * 1.8, 0], { assemblyOrder: 1 + floor * 7, category: 'structure', floor: floor + 1 });
  for (let slot = 0; slot < 6; slot += 1) {
    const room = [];
    box(room, [1.66, .07, 3.7], [0, .02, -.1], colors.wood);
    box(room, [1.66, 1.65, .1], [0, .81, -1.9], colors.white);
    box(room, [.08, 1.65, 3.7], [-.82, .81, -.1], colors.white);
    box(room, [.08, 1.65, 3.7], [.82, .81, -.1], colors.white);
    box(room, [1.66, .11, .13], [0, 1.59, 1.71], colors.white);
    box(room, [1.66, .38, .11], [0, .2, 1.71], colors.white);
    // An open cutaway bay reveals the furniture; the other bay has tinted glazing.
    box(room, [.66, 1.12, .035], [-.41, .96, 1.71], colors.glass);
    box(room, [.045, 1.21, .07], [-.03, .98, 1.73], colors.navy);
    box(room, [.72, .04, .08], [-.41, .48, 1.74], colors.navy);
    box(room, [.72, .04, .08], [-.41, 1.48, 1.74], colors.navy);
    box(room, [.09, 1.13, .06], [-.7, .98, 1.73], slot % 2 ? colors.gold : colors.blue);
    // Bed, mattress, pillow, study desk, chair and wardrobe in every room module.
    box(room, [.7, .24, 1.5], [.38, .2, .38], colors.wood);
    box(room, [.69, .16, 1.45], [.38, .4, .38], slot % 3 ? colors.blue : colors.navy);
    box(room, [.54, .09, .3], [.38, .53, -.12], colors.white);
    box(room, [.66, .62, .1], [.38, .37, -.38], colors.wood);
    box(room, [.75, .08, .47], [-.33, .66, -1.17], colors.wood);
    for (const x of [-.6, -.07]) box(room, [.04, .59, .04], [x, .34, -1.17], colors.navy);
    box(room, [.33, .07, .32], [-.3, .35, -.73], colors.navy);
    box(room, [.33, .35, .055], [-.3, .51, -.56], colors.navy);
    box(room, [.07, .3, .07], [-.3, .19, -.73], colors.navy);
    box(room, [.36, .23, .03], [-.34, .81, -1.22], colors.dark);
    box(room, [.47, 1.35, .48], [.5, .69, -1.59], colors.wood);
    box(room, [.025, 1.23, .012], [.5, .69, -1.34], colors.white);
    addModule(`room-${floor * 6 + slot + 1}-furnished`, room, [(slot - 2.5) * 1.7, .64 + floor * 1.8, 0], { assemblyOrder: 2 + floor * 7 + slot, category: 'room', floor: floor + 1, slot });
  }
}

const roof = [];
box(roof, [11, .22, 4.95], [0, 0, 0], colors.navy);
box(roof, [10.5, .06, 4.45], [0, .15, 0], colors.white);
for (const z of [-2.38, 2.38]) box(roof, [10.85, .33, .11], [0, .26, z], colors.white);
for (const x of [-5.4, 5.4]) box(roof, [.11, .33, 4.7], [x, .26, 0], colors.white);
box(roof, [2.7, .65, 1.5], [2.55, .47, -.95], colors.white);
box(roof, [2.85, .12, 1.65], [2.55, .86, -.95], colors.navy);
for (const x of [-3.5, -2.3, -1.1]) box(roof, [1, .05, 1.55], [x, .25, -.8], colors.glass, [-.12, 0, 0]);
// The brand's F is built from geometry so the model needs no font or image download.
box(roof, [.14, .7, .1], [-4.35, -.04, 2.54], colors.blue);
box(roof, [.47, .14, .1], [-4.15, .24, 2.54], colors.blue);
box(roof, [.36, .14, .1], [-4.2, -.015, 2.54], colors.blue);
addModule('roof-and-shared-facilities', roof, [0, 6.04, 0], { assemblyOrder: 23, category: 'roof' });

document.getRoot().setExtras({ author: 'DataF Project', purpose: 'Conceptual dormitory illustration; not a room availability or construction specification', rooms: 18, storeys: 3 });
await document.transform(weld(), draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 7 }));
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const modelPath = path.join(destination, 'dataf-dormitory.glb');
await io.write(modelPath, document);
const threeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('three'))), '..');
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']) await copyFile(path.join(threeRoot, 'examples/jsm/libs/draco/gltf', name), path.join(destination, 'draco', name));
await copyFile(path.join(threeRoot, 'examples/jsm/libs/draco/README.md'), path.join(destination, 'draco', 'README.md'));
await copyFile(path.join(threeRoot, 'LICENSE'), path.join(destination, 'THREE-LICENSE.txt'));
const modelBytes = (await readFile(modelPath)).length;
await writeFile(path.join(destination, 'model-manifest.json'), `${JSON.stringify({ name: 'DataF conceptual student dormitory', source: 'scripts/generate-dormitory-model.mjs', license: 'Original project-authored geometry; Draco decoder notices in draco/README.md', compression: 'KHR_draco_mesh_compression', modelBytes, rooms: 18, floors: 3, meshGroups: totalDrawCalls, triangles: totalTriangles, textures: 0, parts }, null, 2)}\n`);
console.log(JSON.stringify({ modelPath, modelBytes, meshGroups: totalDrawCalls, triangles: totalTriangles }));
