/** Expected engine failures carry a stable code and an HTTP status. */
export class EngineError extends Error {
  constructor(code, message, status = 422) {
    super(message)
    this.name = 'EngineError'
    this.code = code
    this.status = status
  }
}
