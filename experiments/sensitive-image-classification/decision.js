export const DEFAULT_THRESHOLDS = Object.freeze({
  minimumPersonConfidence: 0.35,
  minimumPoseConfidence: 0.25,
  minimumKeypointConfidence: 0.3,
  minimumConfidentKeypoints: 5,
})

export function decideSensitiveImage(
  { objectDetections = [], faceDetections = [], poses = [] },
  thresholds = DEFAULT_THRESHOLDS,
) {
  const personConfidence = objectDetections
    .filter((entry) => entry?.class === 'person')
    .reduce((highest, entry) => Math.max(highest, Number(entry?.score) || 0), 0)
  const strongestPose = poses.reduce((strongest, pose) => {
    const confidentKeypoints = Array.isArray(pose?.keypoints)
      ? pose.keypoints.filter((keypoint) => Number(keypoint?.score) >= thresholds.minimumKeypointConfidence).length
      : 0
    const poseConfidence = Number(pose?.score) || 0
    return poseConfidence > strongest.poseConfidence
      ? { poseConfidence, confidentKeypoints }
      : strongest
  }, { poseConfidence: 0, confidentKeypoints: 0 })

  const reasons = []
  if (personConfidence >= thresholds.minimumPersonConfidence) reasons.push('person_detected')
  if (faceDetections.length > 0) reasons.push('face_detected')
  if (
    strongestPose.poseConfidence >= thresholds.minimumPoseConfidence &&
    strongestPose.confidentKeypoints >= thresholds.minimumConfidentKeypoints
  ) reasons.push('body_pose_detected')

  return {
    proposedOutcome: reasons.length === 0 ? 'show' : 'hide',
    reasons: reasons.length ? reasons : ['no_human_detected'],
    signals: {
      personConfidence,
      faceCount: faceDetections.length,
      poseConfidence: strongestPose.poseConfidence,
      confidentKeypoints: strongestPose.confidentKeypoints,
    },
    thresholds: { ...thresholds },
  }
}
