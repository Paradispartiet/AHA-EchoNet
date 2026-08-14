import type { AhaRequest } from "../common/request-context.js";

export interface ApiMeta {
  requestId: string;
  apiVersion: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    status: number;
    requestId: string;
  };
  meta: {
    apiVersion: string;
    timestamp: string;
  };
}

export function apiSuccess<T>(request: AhaRequest, apiVersion: string, data: T): ApiSuccess<T> {
  return {
    data,
    meta: {
      requestId: request.requestId || "missing-request-id",
      apiVersion
    }
  };
}
