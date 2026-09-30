export type ErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'validation'
  | 'slot_unavailable'
  | 'outside_booking_window'
  | 'late_change_requires_request'
  | 'change_request_pending'
  | 'invalid_state'
  | 'plan_limit'
  | 'calendar_error';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details ?? null;
    this.status = statusFor(code);
  }
}

function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    case 'validation':
    case 'outside_booking_window':
    case 'late_change_requires_request':
      return 400;
    case 'slot_unavailable':
    case 'change_request_pending':
    case 'invalid_state':
      return 409;
    case 'plan_limit':
      return 402;
    case 'calendar_error':
      return 502;
  }
}
