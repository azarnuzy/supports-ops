import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InvalidWhatsAppCredentialsError, verifyMetaCredentials } from "./services";

const input = {
  accessToken: "permanent-token",
  appSecret: "app-secret",
  businessAccountId: "waba-1",
  phoneNumberId: "phone-1",
};

describe("verifyMetaCredentials", () => {
  it("verifies the token, App Secret, WABA, and Phone Number ID in one Graph API call", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [{ id: "phone-1", display_phone_number: "+62 8123", verified_name: "Acme" }],
      }),
    );

    await expect(verifyMetaCredentials(input, request)).resolves.toMatchObject({ id: "phone-1" });
    const [url, init] = request.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      `appsecret_proof=${createHmac("sha256", input.appSecret).update(input.accessToken).digest("hex")}`,
    );
    expect(init?.headers).toEqual({ authorization: "Bearer permanent-token" });

    request.mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(
      verifyMetaCredentials({ ...input, phoneNumberId: "wrong" }, request),
    ).rejects.toBeInstanceOf(InvalidWhatsAppCredentialsError);
  });
});
