import type {
  ApiSuccessResponse,
  HealthData,
  ReadyData,
} from "@minimi/shared";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function checkApiHealth(): Promise<HealthData> {
  const body = await getJson<ApiSuccessResponse<HealthData>>("/api/health");
  return body.data;
}

export async function checkApiReady(): Promise<ReadyData> {
  const body = await getJson<ApiSuccessResponse<ReadyData>>("/api/health/ready");
  return body.data;
}
