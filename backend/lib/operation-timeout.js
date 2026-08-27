export class OperationTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} exceeded its ${timeoutMs}ms deadline.`)
    this.name = 'OperationTimeoutError'
    this.code = 'OPERATION_TIMEOUT'
    this.label = label
    this.timeoutMs = timeoutMs
  }
}

export function isOperationTimeoutError(error) {
  return error instanceof OperationTimeoutError || error?.code === 'OPERATION_TIMEOUT'
}

export async function runWithTimeout(operation, {
  label = 'Operation',
  timeoutMs,
} = {}) {
  const normalizedTimeoutMs = Math.max(1, Math.round(Number(timeoutMs) || 0))
  let timeoutId

  try {
    return await Promise.race([
      Promise.resolve().then(() => (
        typeof operation === 'function' ? operation() : operation
      )),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new OperationTimeoutError(label, normalizedTimeoutMs))
        }, normalizedTimeoutMs)
        timeoutId.unref?.()
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}
