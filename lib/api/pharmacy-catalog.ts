import { staffApi } from "./staff";
import type { Service } from "./billing";
import type { Paged } from "./types";
export interface DrugInput { name: string; price: number; currency: "IQD" | "USD"; requires_prescription: boolean; reason?: string }
export interface ExternalSale { invoice_id: string; patient_name: string; file_number: string; phone_number: string | null; created_at: string; status: "billed" | "dispensed"; amount: number }
export const pharmacyCatalogApi = {
  list: () => staffApi.get<{ items: Service[] }>("/pharmacy/drugs"),
  create: (body: DrugInput, key: string) => staffApi.post<Service>("/pharmacy/drugs", body, { idempotencyKey: key }),
  update: (id: string, body: DrugInput) => staffApi.patch<Service>(`/pharmacy/drugs/${id}`, body),
  external: (q: { status?: string; q?: string; page?: number; page_size?: number }) => staffApi.get<Paged<ExternalSale>>("/pharmacy/external-sales", q),
};
