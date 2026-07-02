import { describe, expect, it } from 'vitest'

import { decideSensitiveImage } from './decision.js'

describe('sensitive image experiment decision', () => {
  it('proposes showing an image when no human signal is detected', () => {
    expect(decideSensitiveImage({
      objectDetections: [{ class: 'handbag', score: 0.8 }],
      faceDetections: [],
      poses: [],
    })).toMatchObject({ proposedOutcome: 'show', reasons: ['no_human_detected'] })
  })

  it('keeps the image hidden when a person is detected', () => {
    expect(decideSensitiveImage({
      objectDetections: [{ class: 'person', score: 0.72 }],
    })).toMatchObject({ proposedOutcome: 'hide', reasons: ['person_detected'] })
  })

  it('keeps the image hidden when a face or confident body pose is detected', () => {
    expect(decideSensitiveImage({
      faceDetections: [{ box: { width: 100, height: 100 } }],
      poses: [{
        score: 0.8,
        keypoints: Array.from({ length: 6 }, () => ({ score: 0.9 })),
      }],
    })).toMatchObject({
      proposedOutcome: 'hide',
      reasons: ['face_detected', 'body_pose_detected'],
    })
  })

  it('ignores a low-confidence pose artifact', () => {
    expect(decideSensitiveImage({
      poses: [{
        score: 0.1,
        keypoints: Array.from({ length: 4 }, () => ({ score: 0.9 })),
      }],
    }).proposedOutcome).toBe('show')
  })
})
