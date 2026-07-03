import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as faceDetection from '@tensorflow-models/face-detection'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'

import { decideSensitiveImage } from './sensitive-image-decision.js'

let modelsPromise

async function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      tf.enableProdMode()
      await tf.ready()
      const [objectModel, faceModel, poseModel] = await Promise.all([
        cocoSsd.load({ base: 'mobilenet_v2' }),
        faceDetection.createDetector(faceDetection.SupportedModels.MediaPipeFaceDetector, {
          runtime: 'tfjs',
          modelType: 'full',
          maxFaces: 5,
        }),
        poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        }),
      ])
      return { objectModel, faceModel, poseModel }
    })()
  }
  return modelsPromise
}

async function imageTensorFrom(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels], 'int32')
}

export async function analyzeSensitiveImageBuffer(buffer) {
  const { objectModel, faceModel, poseModel } = await loadModels()
  const tensor = await imageTensorFrom(buffer)
  try {
    const [objectDetections, faceDetections, poses] = await Promise.all([
      objectModel.detect(tensor),
      faceModel.estimateFaces(tensor),
      poseModel.estimatePoses(tensor),
    ])
    return {
      ...decideSensitiveImage({ objectDetections, faceDetections, poses }),
      objectDetections,
      faceDetections,
      poses,
    }
  } finally {
    tensor.dispose()
  }
}
