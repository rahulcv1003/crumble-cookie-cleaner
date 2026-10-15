import { describe, expect, it } from "vitest";
import { getRegistrableDomain, isIpAddress, normalizeHost } from "../../src/core/domains";

describe("Rule matching: registrable domains", () => {
  it("RUL-12 registrable domain of news.bbc.co.uk, a.github.io, localhost, IPs, xn--bcher-kva.de", () => {
    expect(getRegistrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(getRegistrableDomain("a.github.io")).toBe("a.github.io"); // private suffixes on
    expect(getRegistrableDomain("b.github.io")).not.toBe(getRegistrableDomain("a.github.io"));
    expect(getRegistrableDomain("localhost")).toBe("localhost");
    expect(getRegistrableDomain("127.0.0.1")).toBe("127.0.0.1");
    expect(getRegistrableDomain("[::1]")).toBe("::1");
    expect(getRegistrableDomain("xn--bcher-kva.de")).toBe("xn--bcher-kva.de");
  });

  it("RUL-12b related cases: Unicode input, cookie domains, subdomains, test sites", () => {
    expect(getRegistrableDomain("shop.bücher.de")).toBe("xn--bcher-kva.de");
    expect(getRegistrableDomain(".accounts.example.com")).toBe("example.com");
    expect(getRegistrableDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(getRegistrableDomain("WWW.Example.COM.")).toBe("example.com");
    expect(getRegistrableDomain("widget.test")).toBe("widget.test");
    expect(getRegistrableDomain("github.io")).toBe("github.io"); // a public suffix maps to itself
    expect(getRegistrableDomain("")).toBe("");
    expect(isIpAddress("10.0.0.1")).toBe(true);
    expect(isIpAddress("example.com")).toBe(false);
    expect(normalizeHost(" .Bücher.DE. ")).toBe("xn--bcher-kva.de");
  });
});
