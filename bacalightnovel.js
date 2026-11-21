// ID: ext_novel_bacalightnovel
// NAME: BacaLightNovel
// TYPE: novel
// VERSION: 1.0.1
// COLOR: #3B5998
// ICON: https://www.google.com/s2/favicons?domain=bacalightnovel.co&sz=64
// REFERER: https://bacalightnovel.co/

var KonmikExtension = {
  baseUrl: "https://bacalightnovel.co",
  sourceId: "ext_novel_bacalightnovel",

  _headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Referer": this.baseUrl + "/"
    };
  },

  async _fetchHtml(url) {
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
    return await res.text();
  },

  // Diagnostik: kalau gagal / kosong, tampilkan penyebabnya sebagai satu item di katalog.
  // Setelah masalah beres, ubah debug menjadi false.
  debug: true,

  _debugItem(text) {
    return [{
      id: "debug", slug: "debug", title: text, cover: "",
      source: this.sourceId, type: "Web Novel", status: "Ongoing"
    }];
  },

  async getList(page, query, filters) {
    let url = "";
    try {
      const out = await this._getListInner(page, query, filters);
      if (out.length === 0 && this.debug) {
        const info = this._lastInfo || "";
        return this._debugItem("[DEBUG] Kosong. " + info);
      }
      return out;
    } catch (e) {
      if (this.debug) return this._debugItem("[ERROR] " + (e && e.message ? e.message : String(e)));
      throw e;
    }
  },

  // Daftar novel / hasil pencarian (20 per halaman di katalog)
  async _getListInner(page, query, filters) {
    page = page || 1;
    let url = "";
    if (query && query.trim().length > 0) {
      const q = encodeURIComponent(query.trim());
      url = page > 1
        ? `${this.baseUrl}/page/${page}/?s=${q}`
        : `${this.baseUrl}/?s=${q}`;
    } else {
      const sort = filters && filters.sort ? filters.sort : "popular";
      const order = sort === "latest" ? "update" : "popular";
      url = page > 1
        ? `${this.baseUrl}/series/page/${page}/?order=${order}`
        : `${this.baseUrl}/series/?order=${order}`;
    }

    const html = await this._fetchHtml(url);
    const flat = html.replace(/\s+/g, " ");
    const tt = flat.match(/<title>([^<]*)<\/title>/i);
    this._lastInfo = "url=" + url + " | panjang=" + html.length + " | title=" + (tt ? tt[1].substring(0, 60) : "(tidak ada)") + " | filters=" + JSON.stringify(filters || {}) + " | page=" + page;

    const novels = [];
    const seen = {};
    const cardRegex = /<article class="maindet"[\s\S]*?<\/article>/gi;
    let m;
    while ((m = cardRegex.exec(flat)) !== null) {
      const block = m[0];
      const hrefMatch = block.match(/href="https:\/\/bacalightnovel\.co\/series\/([^"\/]+)\/?"/i);
      if (!hrefMatch) continue;
      const slug = hrefMatch[1];
      if (seen[slug]) continue;
      seen[slug] = true;

      let title = "";
      const h2 = block.match(/<h2[^>]*>[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/i);
      if (h2) title = this._cleanText(h2[1]);
      if (!title) {
        const t = block.match(/title="([^"]+)"/i);
        title = t ? this._cleanText(t[1]) : slug.replace(/-/g, " ");
      }

      let cover = "";
      const img = block.match(/<img[^>]+src="([^"]+)"/i);
      if (img) cover = this._fixUrl(img[1]);

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

  // Detail novel + daftar bab (urut dari Bab 1 ke terbaru)
  async getDetail(slug) {
    if (slug.indexOf(this.sourceId + "_") === 0) {
      slug = slug.substring(this.sourceId.length + 1);
    }
    const url = slug.indexOf("http") === 0 ? slug : `${this.baseUrl}/series/${slug}/`;
    const html = await this._fetchHtml(url);
    const flat = html.replace(/\s+/g, " ");

    let title = "";
    const h1 = flat.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || flat.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = this._cleanText(h1[1]);
    if (!title) title = slug.replace(/-/g, " ");

    let cover = "";
    const thumb = flat.match(/class="sertothumb"[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (thumb) cover = this._fixUrl(thumb[1]);

    let synopsis = "";
    const syn = flat.match(/class="sersys entry-content"[^>]*>([\s\S]*?)<\/div>/i);
    if (syn) synopsis = this._cleanText(syn[1].replace(/<\/p>/gi, "\n"), true);

    const genres = [];
    const genreBlock = flat.match(/class="sertogenre">([\s\S]*?)<\/div>/i);
    if (genreBlock) {
      const gRe = /<a [^>]*>([^<]+)<\/a>/gi;
      let g;
      while ((g = gRe.exec(genreBlock[1])) !== null) {
        const name = this._cleanText(g[1]);
        if (name && genres.indexOf(name) === -1) genres.push(name);
      }
    }
    if (genres.length === 0) genres.push("Web Novel");

    let status = "Ongoing";
    const st = flat.match(/class="sertostat">\s*<span[^>]*>([^<]+)<\/span>/i);
    if (st) status = this._cleanText(st[1]);

    let type = "Web Novel";
    let author = "";
    const infoBlock = flat.match(/class="sertoauth">([\s\S]*?)<div class="rating/i);
    if (infoBlock) {
      const rowRe = /<span class="sername">([^<]*)<\/span><span class="serval">([\s\S]*?)<\/span><\/div>/gi;
      let r;
      while ((r = rowRe.exec(infoBlock[1])) !== null) {
        const label = this._cleanText(r[1]).toLowerCase();
        const names = [];
        const aRe = /<a [^>]*>([^<]*)<\/a>/gi;
        let a;
        while ((a = aRe.exec(r[2])) !== null) {
          const n = this._cleanText(a[1]);
          if (n && n.toUpperCase() !== "N/A" && names.indexOf(n) === -1) names.push(n);
        }
        if (label === "author") author = names.join(", ");
        if (label === "tipe" && names.length > 0) type = names[0];
      }
    }

    const chapters = [];
    const seen = {};
    const chRe = /<li data-ID="\d+">\s*<a href="(https:\/\/bacalightnovel\.co\/[^"]+)"><div class="epl-num">([^<]*)<\/div><div class="epl-title">([^<]*)<\/div><div class="epl-date">([^<]*)<\/div>/gi;
    let c;
    while ((c = chRe.exec(flat)) !== null) {
      const chUrl = c[1];
      if (seen[chUrl]) continue;
      seen[chUrl] = true;
      const num = this._cleanText(c[2]);
      chapters.push({
        id: 0,
        title: this._cleanText(c[3]) || num,
        slug: chUrl,
        date: this._cleanText(c[4]),
        chapter_number: this._chapterNumber(num)
      });
    }
    // Situs menampilkan bab terbaru di atas; KonMik butuh Bab 1 -> terbaru
    chapters.reverse();

    // Bab pertama (mis. Prolog / Chapter 0) kadang tidak ada di daftar, hanya di tombol "Chapter Pertama"
    const firstBtn = flat.match(/<a href="(https:\/\/bacalightnovel\.co\/[^"]+)">\s*<span>[^<]*<\/span>\s*<span class="epcur epcurfirst">([^<]*)<\/span>/i);
    if (firstBtn && !seen[firstBtn[1]]) {
      const firstLabel = this._cleanText(firstBtn[2]);
      chapters.unshift({
        id: 0,
        title: firstLabel,
        slug: firstBtn[1],
        date: "",
        chapter_number: this._chapterNumber(firstLabel)
      });
    }

    for (let i = 0; i < chapters.length; i++) chapters[i].id = i + 1;

    return {
      title: title,
      cover: cover,
      synopsis: synopsis,
      author: author,
      type: type,
      status: status,
      genres: genres,
      chapters: chapters
    };
  },

  // Isi satu bab (teks HTML; tag <img> dipertahankan untuk ilustrasi)
  async getChapterContent(chapterSlug) {
    const url = chapterSlug.indexOf("http") === 0 ? chapterSlug : `${this.baseUrl}/${chapterSlug}/`;
    const html = await this._fetchHtml(url);

    let title = "";
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = this._cleanText(h1[1]);

    let content = "";
    const startMatch = html.match(/<div[^>]+class="epcontent[^"]*"[^>]*>/i);
    if (startMatch) {
      const from = startMatch.index + startMatch[0].length;
      const rest = html.substring(from);
      let end = rest.search(/<div[^>]+id="text-chapter-toolbar"/i);
      if (end < 0) end = rest.search(/<div[^>]+class="bottomnav"/i);
      if (end < 0) end = rest.search(/<\/article>/i);
      content = end >= 0 ? rest.substring(0, end) : rest;
    }

    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<ins[\s\S]*?<\/ins>/gi, "")
      .replace(/<\/?div[^>]*>/gi, "")
      .replace(/<p>\s*<\/p>/gi, "")
      .replace(/<p>\s*$/i, "")
      .trim();

    return { title: title, html: content };
  },

  _fixUrl(u) {
    return (u || "")
      .replace(/&amp;/g, "&")
      .replace(/ /g, "%20")
      .replace(/\[/g, "%5B")
      .replace(/\]/g, "%5D");
  },

  _chapterNumber(str) {
    const m = str.match(/(\d+(?:\.\d+)?)/);
    return m ? "Chapter " + m[1] : str;
  },

  _cleanText(str, keepNewlines) {
    if (!str) return "";
    let s = str.replace(/<[^>]+>/g, " ");
    s = s
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ");
    if (keepNewlines) {
      return s.split("\n").map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(function (l) { return l; }).join("\n");
    }
    return s.replace(/\s+/g, " ").trim();
  }
};
