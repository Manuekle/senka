import { describe, expect, it } from "vitest";
import { extractSeo, isPrivateAddress, readWebPage } from "./web-page";

describe("isPrivateAddress", () => {
  it("refuses loopback, private, link-local and CGNAT ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.2.3.4",
      "172.20.0.1",
      "192.168.0.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd12::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("lets ordinary public addresses through", () => {
    for (const address of ["8.8.8.8", "142.250.72.14", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("treats anything that is not an address as unsafe", () => {
    expect(isPrivateAddress("example.com")).toBe(true);
  });
});

describe("readWebPage", () => {
  it("refuses private and non-HTTPS destinations before any request", async () => {
    expect((await readWebPage("https://localhost/admin")).ok).toBe(false);
    expect((await readWebPage("http://example.com")).ok).toBe(false);
    expect((await readWebPage("https://169.254.169.254/latest/meta-data")).ok).toBe(false);
  });
});

describe("extractSeo", () => {
  const html = `<!doctype html><html lang="es"><head>
    <title>Gimnasio en Palermo &amp; clases | GymRat</title>
    <meta name="description" content="Clases de fuerza y funcional en Palermo.">
    <meta name="viewport" content="width=device-width">
    <meta property="og:title" content="GymRat">
    <link rel="canonical" href="https://gymrat.example/">
    <link rel="alternate" hreflang="en" href="https://gymrat.example/en">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"HealthClub"}</script>
  </head><body>
    <nav><a href="/precios">Precios</a></nav>
    <h1>Entrená <em>fuerte</em></h1>
    <h2>Planes</h2><h2>Horarios</h2>
    <a href="/contacto">Contacto</a>
    <a href="https://instagram.com/gymrat" rel="nofollow noopener">IG</a>
    <a href="mailto:hola@gymrat.example">Mail</a>
    <img src="a.jpg" alt="Sala"><img src="b.jpg">
  </body></html>`;

  it("reads the tags an SEO review starts from", () => {
    const seo = extractSeo(html, new URL("https://gymrat.example/"));
    expect(seo.title).toBe("Gimnasio en Palermo & clases | GymRat");
    expect(seo.titleLength).toBe(seo.title?.length);
    expect(seo.metaDescription).toBe("Clases de fuerza y funcional en Palermo.");
    expect(seo.canonical).toBe("https://gymrat.example/");
    expect(seo.lang).toBe("es");
    expect(seo.viewport).toBe(true);
    expect(seo.h1).toEqual(["Entrená fuerte"]);
    expect(seo.h2).toEqual(["Planes", "Horarios"]);
    expect(seo.openGraph.title).toBe("GymRat");
    expect(seo.structuredDataTypes).toEqual(["HealthClub"]);
    expect(seo.hreflang).toEqual(["en"]);
    expect(seo.links).toEqual({ internal: 2, external: 1, nofollow: 1 });
    expect(seo.images).toEqual({ total: 2, missingAlt: 1 });
  });

  it("reports what is missing rather than inventing it", () => {
    const seo = extractSeo("<html><body><p>hola</p></body></html>", new URL("https://x.example/"));
    expect(seo.title).toBeUndefined();
    expect(seo.metaDescription).toBeUndefined();
    expect(seo.viewport).toBe(false);
    expect(seo.h1).toEqual([]);
    expect(seo.wordCount).toBe(1);
  });
});
