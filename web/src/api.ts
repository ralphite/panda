import type { Annotation, ScreenshotDetail, ScreenshotSummary } from './types';

interface ListResponse {
  screenshots: ScreenshotSummary[];
}

interface DetailResponse {
  screenshot: ScreenshotDetail;
}

interface CreateResponse {
  screenshot: ScreenshotDetail;
  url: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const payload = await res.json();
      message = payload?.error?.message ?? message;
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function listScreenshots(): Promise<ScreenshotSummary[]> {
  const payload = await request<ListResponse>('/api/screenshots?limit=100');
  return payload.screenshots;
}

export async function getScreenshot(id: string): Promise<ScreenshotDetail> {
  const payload = await request<DetailResponse>(`/api/screenshots/${id}`);
  return payload.screenshot;
}

export async function createScreenshot(input: {
  imageData: string;
  sourceUrl?: string;
  pageTitle?: string;
  annotations?: Annotation[];
}): Promise<CreateResponse> {
  return request<CreateResponse>('/api/screenshots', {
    method: 'POST',
    body: JSON.stringify({
      imageData: input.imageData,
      sourceUrl: input.sourceUrl ?? '',
      pageTitle: input.pageTitle ?? '',
      annotations: input.annotations ?? [],
    }),
  });
}

export async function updateAnnotations(id: string, annotations: Annotation[]): Promise<ScreenshotDetail> {
  const payload = await request<DetailResponse>(`/api/screenshots/${id}/annotations`, {
    method: 'PUT',
    body: JSON.stringify({ annotations }),
  });
  return payload.screenshot;
}

