import { z } from "zod";

const customerSchema = z.object({ id: z.string(), name: z.string(), email: z.string().email() });
const subscriptionSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  plan: z.string(),
  renewalDate: z.string().date(),
  status: z.string(),
});
const invoiceSchema = z.object({
  amount: z.string(),
  customerId: z.string(),
  dueDate: z.string().date(),
  id: z.string(),
  status: z.string(),
});

export type BusinessCustomer = z.infer<typeof customerSchema>;
export type BusinessSubscription = z.infer<typeof subscriptionSchema>;
export type BusinessInvoice = z.infer<typeof invoiceSchema>;

export class BusinessToolError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BusinessToolError";
  }
}

export type BusinessTools = {
  getCustomerByEmail(email: string): Promise<BusinessCustomer | null>;
  getInvoiceStatus(customerId: string, invoiceId?: string): Promise<BusinessInvoice | null>;
  getSubscriptionStatus(customerId: string): Promise<BusinessSubscription | null>;
};

export function createBusinessTools(baseUrl: string, fetcher: typeof fetch = fetch): BusinessTools {
  const request = async (path: string) => {
    let response: Response;
    try {
      response = await fetcher(new URL(path, baseUrl));
    } catch (error) {
      throw new BusinessToolError("The Business System could not be reached.", { cause: error });
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new BusinessToolError(`The Business System returned ${response.status}.`);
    try {
      return await response.json();
    } catch (error) {
      throw new BusinessToolError("The Business System returned an invalid response.", { cause: error });
    }
  };

  return {
    async getCustomerByEmail(email) {
      const result = await request(`/customers?email=${encodeURIComponent(email)}`);
      try {
        return result === null ? null : customerSchema.parse(result);
      } catch (error) {
        throw new BusinessToolError("The Business System returned an invalid customer.", { cause: error });
      }
    },
    async getSubscriptionStatus(customerId) {
      const result = await request(`/customers/${encodeURIComponent(customerId)}/subscription`);
      try {
        return result === null ? null : subscriptionSchema.parse(result);
      } catch (error) {
        throw new BusinessToolError("The Business System returned an invalid subscription.", { cause: error });
      }
    },
    async getInvoiceStatus(customerId, invoiceId) {
      const query = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : "";
      const result = await request(`/customers/${encodeURIComponent(customerId)}/invoices${query}`);
      try {
        return result === null ? null : invoiceSchema.parse(result);
      } catch (error) {
        throw new BusinessToolError("The Business System returned an invalid invoice.", { cause: error });
      }
    },
  };
}
