// ID: ext_novel_blnprobe
// NAME: BLN Probe
// TYPE: novel
// VERSION: 1.0.0
// COLOR: #3B5998
// ICON: https://www.google.com/s2/favicons?domain=bacalightnovel.co&sz=64
// REFERER: https://bacalightnovel.co/

// File TES sementara: cek endpoint mana yang bisa dibuka app tanpa kena Cloudflare.
var KonmikExtension = {
  baseUrl: "https://bacalightnovel.co",
  cfClearance: "CshuZ5nHfiTVZ36OFPVbW58oCe_Xg2_yxHkuB3muOsO5AA5L0GeSnIf7IIBWcuAZ8ebhahmGscH6fx-l64n_9qRCCnBlh10_ohOUpUpmvY83Eo6jaRXxZbV_Bc9ecuWtQMJoFfR1nAxzraLfC0BOVQzbEiuo0jazOKtYv9L_vlZVQskx5IyN7IO1aDElt5Zmu75i4_rjDUcKq1fiZ-6sxAHPxTYb3t5HFDrTA-MfrMCP28jFHUxxhmahkh3roFn2kgouQ2tAsFmZ2kK1AMbdc0WXVIEkQCEhyioCS1o_ff5OGWPH44IEhG6DtFIbXPrib-Ehv5ku6vJB8bOUBiGKrBpzcqUDnHdsoDCqq9CI_Tr1a3hWV6xR9CWwqMLbvWtXU7y_Rq1TR72g2Y-x8Kia98I",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",

  _targets: [
    ["katalog", "/series/?order=popular"],
    ["home", "/"],
    ["feed", "/feed/"],
    ["wpjson", "/wp-json/wp/v2/posts?per_page=1"],
    ["sitemap", "/wp-sitemap.xml"],
    ["detail", "/series/001-second-sword-master-raw/"],
    ["bab", "/001-second-sword-master-raw-chapter-1/"]
  ],

  _kind(t) {
    const s = (t || "").trim().substring(0, 400).toLowerCase();
    if (/just a moment|challenge-platform|cf-chl|attention required/.test(t.toLowerCase())) return "CF-BLOCK";
    if (s.indexOf("<?xml") === 0 || s.indexOf("<rss") === 0 || s.indexOf("<urlset") === 0 || s.indexOf("<sitemapindex") >= 0) return "OK-XML";
    if (s.charAt(0) === "[" || s.charAt(0) === "{") return "OK-JSON";
    if (/maindet|epcontent|sertoinfo/.test(t)) return "OK-HTML";
    return "LAIN";
  },

  async _probe(name, path) {
    const h = { "User-Agent": this.userAgent, "Referer": this.baseUrl + "/" };
    if (this.cfClearance) h["Cookie"] = "cf_clearance=" + this.cfClearance;
    try {
      const res = await fetch(this.baseUrl + path, { headers: h });
      const t = await res.text();
      return name + " " + res.status + " " + this._kind(t) + " " + t.length;
    } catch (e) {
      return name + " ERR " + (e && e.message ? e.message : String(e)).substring(0, 20);
    }
  },

  async getList(page, query, filters) {
    if ((page || 1) > 1) return [];
    const results = await Promise.all(this._targets.map(t => this._probe(t[0], t[1])));
    return results.map((r, i) => ({
      id: "probe-" + i, slug: "probe-" + i, title: r, cover: "",
      source: "ext_novel_blnprobe", type: "Web Novel", status: "Ongoing"
    }));
  },

  async getDetail(slug) {
    return { title: "probe", cover: "", synopsis: "", author: "", type: "Web Novel", status: "Ongoing", genres: [], chapters: [] };
  },

  async getChapterContent(s) { return { title: "probe", html: "" }; }
};
