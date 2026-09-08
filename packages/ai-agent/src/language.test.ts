import { describe, expect, it } from "vitest";
import { detectLanguage, languageName } from "./language";

describe("detectLanguage", () => {
  it("detects English from common stopwords", () => {
    expect(detectLanguage("Please reset the password and you are all set, thanks.")).toBe("en");
  });

  it("detects Indonesian from common stopwords", () => {
    expect(detectLanguage("Silakan reset kata sandi anda yang sudah kadaluarsa, terima kasih.")).toBe(
      "id",
    );
  });

  it("returns unknown when no supported language's stopwords are present", () => {
    expect(detectLanguage("Bonjour, je voudrais parler à un agent humain.")).toBe("unknown");
  });
});

describe("languageName", () => {
  it("names each supported language for use in a prompt", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("id")).toBe("Indonesian");
  });
});
