/**
 * The slice of Babylon.js this game uses, imported by deep path so the production bundle
 * only carries what is needed (the package root pulls in every subsystem). Modules imported
 * for side effects register engine extensions and scene components.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/Extensions/engine.renderTarget';
import '@babylonjs/core/Engines/Extensions/engine.alpha';
import '@babylonjs/core/Engines/Extensions/engine.readTexture';
import '@babylonjs/core/Materials/standardMaterial';

export { Engine } from '@babylonjs/core/Engines/engine';
export { Constants } from '@babylonjs/core/Engines/constants';
export { Scene } from '@babylonjs/core/scene';
export { Vector3 } from '@babylonjs/core/Maths/math.vector';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
export { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export { Material } from '@babylonjs/core/Materials/material';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
export { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
export { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';
