import { staffApi } from "./staff";
import type { Service, DirectOrderItem } from "./billing";

export interface LabServiceInput { name: string; price: number; currency: "IQD" | "USD"; reason?: string }
export interface LabDirectResult { items: DirectOrderItem[]; patient_id: string; patient_name: string; file_number: string; total_due: number }
export const labCatalogApi = {
  list: () => staffApi.get<{ items: Service[] }>("/lab/services"),
  create: (body: LabServiceInput, key: string) => staffApi.post<Service>("/lab/services", body, { idempotencyKey: key }),
  update: (id: string, body: LabServiceInput) => staffApi.patch<Service>(`/lab/services/${id}`, body),
  direct: (body: { new_patient: { full_name: string; phone_number: string }; items: { service_id: string }[] }, key: string) =>
    staffApi.post<LabDirectResult>("/lab/orders/direct", body, { idempotencyKey: key }),
};
