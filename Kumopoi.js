// ID: ext_kumopoi
// NAME: Kumopoi (Beta)
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #6C5CE7
// ICON: https://www.google.com/s2/favicons?domain=kumopoi.com&sz=64
// REFERER: https://beta.kumopoi.com/

const BASE = 'https://beta.kumopoi.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': BASE + '/',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8'
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

function abs(u) {
  if (!u) return '';
  u = u.trim().replace(/&amp;/g, '&');
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  if (u.startsWith('/')) return BASE + u;
  return BASE + '/' + u;
}

function clean(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-').replace(/&#8217;/g, "'")
    .replace(/&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function first(regexes, str, def) {
  for (const r of regexes) {
    const m = str.match(r);
    if (m && m[1] && m[1].trim()) return m[1].trim();
  }
  return def || '';
}

function imgSrc(block) {
  const m = block.match(/<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
  let src = m ? m[1] : '';
  if (src.startsWith('data:')) {
    const d = block.match(/<img[^>]+(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i);
    src = d ? d[1] : '';
  }
  return abs(src);
}

function isChapterUrl(u) {
  return /(chapter|chap|ch-|episode|\/ep-|\/ch\/|\/read\/)/i.test(u);
}

function tryNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

var KonmikExtension = {
  async getList(page, query, filters) {
    page = page || 1;
    const sort = filters && filters.sort ? filters.sort : 'latest';
    let url;
    if (query && query.trim()) {
      const q = encodeURIComponent(query.trim());
      url = page > 1 ? `${BASE}/page/${page}/?s=${q}` : `${BASE}/?s=${q}`;
    } else {
      const order = sort === 'popular' ? 'popular' : 'update';
      url = `${BASE}/manga/?page=${page}&order=${order}`;
    }

    const html = await fetchHtml(url);
    const list = [];
    const seen = {};

    // Strategi 1: kartu bergaya tema manga umum (div.bs / div.bsx / div.utao / article)
    const cardRegex = /<(?:div|article)[^>]+class=["'][^"']*\b(?:bs|bsx|listupd|utao|uta|animepost|manga-item|comic-card)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article)>\s*<\/(?:div|article)>/gi;
    let m;
    while ((m = cardRegex.exec(html)) !== null) {
      const block = m[1];
      const link = block.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (!link) continue;
      const href = abs(link[1]);
      if (isChapterUrl(href) || seen[href]) continue;
      let title = first([
        /<a[^>]+title=["']([^"']+)["']/i,
        /<img[^>]+alt=["']([^"']+)["']/i,
        /class=["'][^"']*(?:tt|title)[^"']*["'][^>]*>([\s\S]*?)<\//i
      ], block);
      title = clean(title);
      const cover = imgSrc(block);
      if (!title || !cover) continue;
      seen[href] = true;
      list.push({
        id: href,
        title: title,
        cover_url: cover,
        latest_chapter: clean(first([/class=["'][^"']*(?:epxs|chapter|latest)[^"']*["'][^>]*>([\s\S]*?)<\//i], block)),
        rating: clean(first([/class=["'][^"']*(?:numscore|rating|score)[^"']*["'][^>]*>([\s\S]*?)<\//i], block, '-')),
        views: '-'
      });
    }

    // Strategi 2 (cadangan): semua <a> yang membungkus gambar
    if (list.length === 0) {
      const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,800}?)<\/a>/gi;
      while ((m = aRegex.exec(html)) !== null) {
        const href = abs(m[1]);
        if (!href.startsWith(BASE) || isChapterUrl(href) || seen[href]) continue;
        if (!/<img/i.test(m[2])) continue;
        const cover = imgSrc(m[2]);
        const title = clean(first([
          /title=["']([^"']+)["']/i,
          /alt=["']([^"']+)["']/i
        ], m[0]) || m[2]);
        if (!cover || !title || title.length > 150) continue;
        seen[href] = true;
        list.push({ id: href, title: title, cover_url: cover, latest_chapter: '', rating: '-', views: '-' });
      }
    }

    return { manga_list: list };
  },

  async getDetail(slug) {
    const url = slug.startsWith('http') ? slug : abs(slug);
    const html = await fetchHtml(url);

    const title = clean(first([
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /property=["']og:title["'][^>]*content=["']([^"']+)["']/i
    ], html, 'Tanpa Judul'));

    let cover = first([
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i
    ], html);
    if (!cover) {
      const t = html.match(/class=["'][^"']*(?:thumb|cover|poster)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (t) cover = imgSrc(t[1]);
    }
    cover = abs(cover);

    const description = clean(first([
      /itemprop=["']description["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i,
      /class=["'][^"']*(?:entry-content|synopsis|sinopsis|summary)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /name=["']description["'][^>]*content=["']([^"']+)["']/i
    ], html, 'Tidak ada deskripsi.'));

    const author = clean(first([
      /(?:Author|Pengarang|Penulis)[\s\S]{0,80}?<(?:i|span|b|td|div)[^>]*>([^<]+)</i
    ], html, 'Unknown'));
    const artist = clean(first([
      /(?:Artist|Ilustrator|Seniman)[\s\S]{0,80}?<(?:i|span|b|td|div)[^>]*>([^<]+)</i
    ], html, author));

    const genres = [];
    const gRegex = /<a[^>]+href=["'][^"']*\/(?:genres?|genre)\/[^"']*["'][^>]*>([^<]+)<\/a>/gi;
    let g;
    while ((g = gRegex.exec(html)) !== null) {
      const name = clean(g[1]);
      if (name && !genres.includes(name)) genres.push(name);
    }

    // Daftar bab (urutan situs: terbaru -> terlama)
    const chapters = [];
    const seen = {};
    const cRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let c;
    while ((c = cRegex.exec(html)) !== null) {
      const href = abs(c[1]);
      if (!href.startsWith(BASE) || !isChapterUrl(href) || seen[href]) continue;
      const inner = c[2];
      let chTitle = clean(first([
        /class=["'][^"']*chapternum[^"']*["'][^>]*>([\s\S]*?)<\//i,
        /class=["'][^"']*(?:chapter-title|ch-title)[^"']*["'][^>]*>([\s\S]*?)<\//i
      ], inner) || inner);
      if (!chTitle) continue;
      if (chTitle.length > 80) chTitle = chTitle.substring(0, 80);
      const date = clean(first([
        /class=["'][^"']*(?:chapterdate|date|time)[^"']*["'][^>]*>([\s\S]*?)<\//i
      ], inner, '-'));
      seen[href] = true;
      chapters.push({ id: href, title: chTitle, endpoint: href, date: date });
    }

    // Pastikan terbaru di atas (cek nomor bab jika ada)
    const num = (t) => { const n = t.match(/(\d+(?:\.\d+)?)/); return n ? parseFloat(n[1]) : 0; };
    if (chapters.length > 1 && num(chapters[0].title) < num(chapters[chapters.length - 1].title)) {
      chapters.reverse();
    }

    return {
      title: title,
      cover_url: cover,
      description: description,
      author: author,
      artist: artist,
      rating: clean(first([/class=["'][^"']*(?:num|rating|score)[^"']*["'][^>]*>([\d.,]+)</i], html, '-')),
      views: '-',
      genres: genres.length ? genres : ['Komik'],
      chapters: chapters
    };
  },

  async getChapterImages(endpoint) {
    const url = endpoint.startsWith('http') ? endpoint : abs(endpoint);
    const html = await fetchHtml(url);
    let images = [];

    // 1) ts_reader.run({... "images":[...] ...})
    const ts = html.match(/"images"\s*:\s*(\[[\s\S]*?\])/);
    if (ts) {
      try { images = JSON.parse(ts[1]).map(abs); } catch (e) { images = []; }
    }

    // 2) Next.js __NEXT_DATA__
    if (images.length === 0) {
      const nd = tryNextData(html);
      if (nd) {
        const found = [];
        const walk = (o) => {
          if (!o) return;
          if (typeof o === 'string') {
            if (/^https?:\/\/.+\.(?:jpe?g|png|webp|avif)(?:\?.*)?$/i.test(o)) found.push(o);
          } else if (Array.isArray(o)) o.forEach(walk);
          else if (typeof o === 'object') Object.keys(o).forEach((k) => walk(o[k]));
        };
        walk(nd);
        images = found;
      }
    }

    // 3) <img> di area pembaca
    if (images.length === 0) {
      const area = first([
        /id=["']readerarea["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<script|<footer)/i,
        /class=["'][^"']*(?:reader|chapter-content|reading-content|viewer)[^"']*["'][^>]*>([\s\S]*?)<\/section>/i
      ], html) || html;
      const re = /<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(area)) !== null) {
        const u = abs(m[1]);
        if (/\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(u) && !/(logo|icon|avatar|banner|favicon)/i.test(u)) {
          images.push(u);
        }
      }
    }

    // Hapus duplikat, jaga urutan
    const out = [];
    const seen = {};
    for (const u of images) {
      if (u && !seen[u]) { seen[u] = true; out.push(u); }
    }
    return out;
  }
};
