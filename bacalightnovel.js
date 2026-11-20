// ID: ext_novel_bacalightnovel
// NAME: BacaLightNovel
// TYPE: novel
// VERSION: 1.0.2
// COLOR: #3B5998
// ICON: https://www.google.com/s2/favicons?domain=bacalightnovel.co&sz=64
// REFERER: https://bacalightnovel.co/

var KonmikExtension = {
  baseUrl: "https://bacalightnovel.co",
  sourceId: "ext_novel_bacalightnovel",

  _headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": this.baseUrl + "/"
    };
  },

  async _get(url) {
    const res = await fetch(url, { headers: this._headers() });
    if (res.ok === false) throw new Error("HTTP " + res.status + " saat membuka " + url);
    return await res.text();
  },

  // ---------------------------------------------------------------
  // 1. LIST / SEARCH
  // ---------------------------------------------------------------
  async getList(page, query, filters) {
    try {
      return await this._getListReal(page, query, filters);
    } catch (e) {
      // Mode diagnosis: tampilkan error sebagai item agar terlihat di layar
      if ((page || 1) > 1) return [];
      return [{
        id: "debug-error",
        slug: "debug-error",
        title: "ERROR: " + (e && e.message ? e.message : String(e)),
        cover: "",
        source: this.sourceId,
        type: "Web Novel",
        status: "Ongoing"
      }];
    }
  },

  async _getListReal(page, query, filters) {
    page = page || 1;
    filters = filters || {};
    const urls = [];
    if (query && query.trim().length > 0) {
      const q = encodeURIComponent(query.trim());
      urls.push(page > 1
        ? `${this.baseUrl}/page/${page}/?s=${q}`
        : `${this.baseUrl}/?s=${q}`);
    } else {
      const sort = filters.sort || filters.order || "popular";
      const order = (sort === "latest" || sort === "update") ? "update" : "popular";
      const pg = page > 1 ? `&page=${page}` : "";
      urls.push(`${this.baseUrl}/series/?order=${order}${pg}`);
      urls.push(`${this.baseUrl}/series/?${page > 1 ? "page=" + page : ""}`);
    }

    let lastHtml = "";
    for (const url of urls) {
      const html = await this._get(url);
      lastHtml = html;
      const items = this._parseCards(html);
      if (items.length > 0) return items;
    }

    // Kosong: cek penyebabnya supaya mudah didiagnosis
    if (/just a moment|cf-browser-verification|challenge-platform|cf-chl|attention required/i.test(lastHtml)) {
      throw new Error("Diblokir Cloudflare/bot detection oleh situs");
    }
    if (page > 1) return [];
    throw new Error("Kartu novel tidak ditemukan. Panjang HTML: " + lastHtml.length + ", awal: " + lastHtml.substring(0, 150).replace(/\s+/g, " "));
  },

  _parseCards(html) {
    const novels = [];
    const seen = {};

    // Kartu katalog: <article class="maindet">; hasil cari bisa memakai pola lain (bsx)
    let blocks = html.split(/<article[^>]+class=["']maindet["']/i).slice(1);
    if (blocks.length === 0) {
      blocks = html.split(/<div[^>]+class=["']bsx["']/i).slice(1);
    }

    for (const raw of blocks) {
      const block = raw.substring(0, 3000);
      const hrefMatch = block.match(/href=["']https?:\/\/[^"']*\/series\/([^"'\/]+)\/?["']/i);
      if (!hrefMatch) continue;
      const slug = hrefMatch[1];
      if (seen[slug]) continue;
      seen[slug] = true;

      let cover = "";
      const imgMatch = block.match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
      if (imgMatch) cover = this._fixUrl(imgMatch[1]);

      let title = "";
      const h2 = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      if (h2) title = this._cleanText(h2[1]);
      if (!title) {
        const t = block.match(/title=["']([^"']+)["']/i);
        if (t) title = this._cleanText(t[1]);
      }
      if (!title) title = slug.replace(/-/g, " ");

      novels.push({
        id: slug,
        slug: slug,
        title: title,
        cover: cover,
        source: this.sourceId,
        type: "Web Novel",
        status: "Ongoing"
      });
    }
    return novels;
  },

  // ---------------------------------------------------------------
  // 2. DETAIL + DAFTAR BAB
  // ---------------------------------------------------------------
  async getDetail(slug) {
    const prefix = this.sourceId + "_";
    if (slug.startsWith(prefix)) slug = slug.substring(prefix.length);
    const url = slug.startsWith("http") ? slug : `${this.baseUrl}/series/${slug}/`;
    const html = await this._get(url);

    let title = "";
    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) title = this._cleanText(titleMatch[1]);
    if (!title) title = slug.replace(/-/g, " ");

    // Cover: gambar pertama sebelum blok info, fallback og:image
    let cover = "";
    const infoIdx = html.search(/class=["']sertoinfo["']/i);
    const head = infoIdx > 0 ? html.substring(Math.max(0, infoIdx - 2500), infoIdx) : "";
    const coverMatch = head.match(/<img[^>]+src=["']([^"']+)["'][^>]*>(?![\s\S]*<img)/i);
    if (coverMatch) cover = this._fixUrl(coverMatch[1]);
    if (!cover) {
      const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                 html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (og) cover = this._fixUrl(og[1]);
    }

    let synopsis = "";
    const synMatch = html.match(/<div class=["']sersys entry-content["'][^>]*>([\s\S]*?)<\/div>/i);
    if (synMatch) synopsis = this._cleanText(synMatch[1].replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n"), true);

    const genres = [];
    const genreBlock = html.match(/<div class=["']sertogenre["'][^>]*>([\s\S]*?)<\/div>/i);
    if (genreBlock) {
      const gRe = /<a[^>]*>([^<]+)<\/a>/gi;
      let g;
      while ((g = gRe.exec(genreBlock[1])) !== null) {
        const name = this._cleanText(g[1]);
        if (name && genres.indexOf(name) === -1) genres.push(name);
      }
    }
    if (genres.length === 0) genres.push("Web Novel");

    let status = "Ongoing";
    const st = html.match(/<div class=["']sertostat["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/i);
    if (st) status = this._cleanText(st[1]);

    let type = "Web Novel";
    const tp = html.match(/<span class=["']sername["']>\s*Tipe\s*<\/span><span class=["']serval["']>([\s\S]*?)<\/span>/i);
    if (tp) type = this._cleanText(tp[1]) || type;

    const authors = [];
    const au = html.match(/<span class=["']sername["']>\s*Author\s*<\/span><span class=["']serval["']>([\s\S]*?)<\/span><\/div>/i);
    if (au) {
      const aRe = /<a[^>]*>([^<]+)<\/a>/gi;
      let a;
      while ((a = aRe.exec(au[1])) !== null) {
        const name = this._cleanText(a[1]);
        if (name && name.toUpperCase() !== "N/A" && authors.indexOf(name) === -1) authors.push(name);
      }
    }

    // Daftar bab (di situs urutannya terbaru -> terlama)
    const chapters = [];
    const chSeen = {};
    const chRe = /<li[^>]*data-id=["']\d+["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>\s*<div class=["']epl-num["']>([\s\S]*?)<\/div>\s*<div class=["']epl-title["']>([\s\S]*?)<\/div>\s*<div class=["']epl-date["']>([\s\S]*?)<\/div>/gi;
    let c;
    while ((c = chRe.exec(html)) !== null) {
      const chUrl = c[1];
      if (chSeen[chUrl]) continue;
      chSeen[chUrl] = true;
      chapters.push({
        title: this._cleanText(c[3]) || this._cleanText(c[2]),
        slug: chUrl,
        date: this._cleanText(c[4]),
        chapter_number: this._extractChapterNumber(this._cleanText(c[2]) || this._cleanText(c[3]))
      });
    }
    chapters.reverse(); // Bab 1 (tertua) -> terbaru
    for (let i = 0; i < chapters.length; i++) chapters[i].id = i + 1;

    return {
      title: title,
      cover: cover,
      synopsis: synopsis,
      author: authors.join(", "),
      type: type,
      status: status,
      genres: genres,
      chapters: chapters
    };
  },

  // ---------------------------------------------------------------
  // 3. ISI BAB
  // ---------------------------------------------------------------
  async getChapterContent(chapterSlug) {
    const url = chapterSlug.startsWith("http") ? chapterSlug : `${this.baseUrl}/${chapterSlug}/`;
    const html = await this._get(url);

    let title = "";
    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) title = this._cleanText(titleMatch[1]);

    let content = "";
    const start = html.match(/<div class=["']epcontent[^"']*["'][^>]*>\s*(?:<div class=["']text-left["'][^>]*>)?/i);
    if (start) {
      const from = start.index + start[0].length;
      const rest = html.substring(from);
      const endToolbar = rest.search(/<\/div>\s*<div id=["']text-chapter-toolbar["']/i);
      const endBottom = rest.search(/<div class=["']bottomnav["']/i);
      let end = endToolbar;
      if (end < 0) end = endBottom;
      content = end >= 0 ? rest.substring(0, end) : rest.substring(0, 200000);
    }

    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<ins[\s\S]*?<\/ins>/gi, "")
      .replace(/<p>\s*(?:&nbsp;)?\s*<\/p>/gi, "")
      .replace(/<p>\s*$/i, "")
      .trim();

    // Pastikan src gambar absolut supaya ilustrasi tampil di reader
    content = content.replace(/(<img[^>]+src=["'])(\/[^"']+)(["'])/gi, (m, a, b, c) => a + this.baseUrl + b + c);

    return {
      title: title,
      html: content
    };
  },

  // ---------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------
  _fixUrl(u) {
    if (!u) return "";
    u = u.trim();
    if (u.startsWith("//")) u = "https:" + u;
    else if (u.startsWith("/")) u = this.baseUrl + u;
    return u.replace(/ /g, "%20");
  },

  _cleanText(str, keepNewline) {
    if (!str) return "";
    let s = str
      .replace(/<[^>]+>/g, " ")
      .replace(/&#8211;/g, "–")
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#038;/g, "&")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, " ");
    if (keepNewline) {
      return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    }
    return s.replace(/\s+/g, " ").trim();
  },

  _extractChapterNumber(text) {
    const m = (text || "").match(/(\d+(?:\.\d+)?)/);
    return m ? "Chapter " + m[1] : text;
  }
};
